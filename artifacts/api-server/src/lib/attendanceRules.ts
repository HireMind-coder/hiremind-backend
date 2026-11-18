import { db, pool, attendanceSettingsTable, employeeDevicesTable, employeesTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { notifyAdmin } from "./pushService";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// 1) Tables are created at server start (Railway deploy has no `drizzle push` step)
// ─────────────────────────────────────────────────────────────────────────────
export async function ensureAttendanceSettingsTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_settings (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      geofence_enabled boolean NOT NULL DEFAULT false,
      geofence_lat double precision,
      geofence_lng double precision,
      geofence_radius integer NOT NULL DEFAULT 100,
      device_verification boolean NOT NULL DEFAULT false,
      block_fake_gps boolean NOT NULL DEFAULT false,
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT attendance_settings_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT attendance_settings_admin_id_unique UNIQUE (admin_id)
    );

    CREATE TABLE IF NOT EXISTS custom_leave_types (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      name text NOT NULL,
      days_per_year integer NOT NULL DEFAULT 0,
      color text NOT NULL DEFAULT '#F59E0B',
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT custom_leave_types_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      date text NOT NULL,
      name text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT holidays_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT holidays_admin_date_unique UNIQUE (admin_id, date)
    );

    CREATE TABLE IF NOT EXISTS employee_devices (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      employee_id integer NOT NULL,
      device_id text NOT NULL,
      device_name text,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT employee_devices_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT employee_devices_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT employee_devices_employee_device_unique UNIQUE (employee_id, device_id)
    );
    -- Auto-Live Track
    ALTER TABLE attendance_settings ADD COLUMN IF NOT EXISTS auto_live_track boolean NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS location_pings (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      employee_id integer NOT NULL,
      attendance_id integer,
      latitude double precision NOT NULL,
      longitude double precision NOT NULL,
      accuracy double precision,
      recorded_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT location_pings_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT location_pings_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS location_pings_employee_time_idx ON location_pings (employee_id, recorded_at);

    -- keep only the last 30 days of location history
    DELETE FROM location_pings WHERE recorded_at < now() - interval '30 days';
  `);
  logger.info("Attendance settings tables ready");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Settings helpers
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  geofenceEnabled: false,
  geofenceLat: null as number | null,
  geofenceLng: null as number | null,
  geofenceRadius: 100,
  deviceVerification: false,
  blockFakeGps: false,
  autoLiveTrack: false,
};

export async function getAttendanceSettings(adminId: number) {
  const [row] = await db
    .select()
    .from(attendanceSettingsTable)
    .where(eq(attendanceSettingsTable.adminId, adminId))
    .limit(1);
  return row ?? { id: 0, adminId, ...DEFAULT_SETTINGS, updatedAt: new Date() };
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Enforcement used by /attendance (POST) and /verify-attendance
// ─────────────────────────────────────────────────────────────────────────────
export type RuleResult =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

export interface RuleInput {
  adminId: number;
  /** req.user from requireAuth */
  user: any;
  /** The employee whose attendance is being marked */
  employeeId: number;
  latitude?: number | null;
  longitude?: number | null;
  /** true when Android reports the GPS fix as a mock location */
  mocked?: unknown;
  deviceId?: unknown;
  deviceName?: unknown;
  /** Geofence + fake-GPS checks need a location. Pass false for check-outs that carry no location. */
  needsLocation: boolean;
}

export async function enforceAttendanceRules(input: RuleInput): Promise<RuleResult> {
  const { adminId, user, employeeId, needsLocation } = input;

  // Rules protect against employees cheating on their OWN phone.
  // Admin / kiosk / manager marking someone else is not restricted.
  if (!user || user.role !== "employee" || Number(user.employeeId) !== Number(employeeId)) {
    return { ok: true };
  }

  const s = await getAttendanceSettings(adminId);

  // ── Block Fake GPS ──
  if (s.blockFakeGps && needsLocation) {
    if (typeof input.mocked !== "boolean") {
      return {
        ok: false, status: 400, code: "APP_UPDATE_REQUIRED",
        error: "Please update the HireMind app to mark attendance.",
      };
    }
    if (input.mocked === true) {
      return {
        ok: false, status: 403, code: "FAKE_GPS",
        error: "Fake GPS / mock location detected. Turn it off and try again.",
      };
    }
  }

  // ── GPS Based Geofence ──
  if (s.geofenceEnabled && needsLocation && s.geofenceLat != null && s.geofenceLng != null) {
    const lat = Number(input.latitude);
    const lng = Number(input.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || input.latitude == null || input.longitude == null) {
      return {
        ok: false, status: 400, code: "LOCATION_REQUIRED",
        error: "Location is required to mark attendance. Please turn on GPS and allow location access.",
      };
    }
    // Allowed inside the main office circle OR any branch that has a saved location
    const spots = [{ label: "office", lat: s.geofenceLat, lng: s.geofenceLng, radius: s.geofenceRadius }];
    const branches = await db.select().from(branchesTable).where(eq(branchesTable.adminId, adminId));
    for (const b of branches) {
      if (b.latitude != null && b.longitude != null) {
        spots.push({ label: b.name, lat: b.latitude, lng: b.longitude, radius: b.radius });
      }
    }
    const measured = spots.map((sp) => ({ ...sp, dist: Math.round(distanceMeters(lat, lng, sp.lat, sp.lng)) }));
    if (!measured.some((m) => m.dist <= m.radius)) {
      const nearest = measured.reduce((a, b) => (b.dist < a.dist ? b : a));
      const where = nearest.label === "office" ? "the office" : nearest.label;
      return {
        ok: false, status: 403, code: "OUT_OF_GEOFENCE",
        error: `You are ${nearest.dist} m away from ${where}. Attendance is allowed only within ${nearest.radius} m.`,
      };
    }
  }

  // ── Device Verification ──
  if (s.deviceVerification) {
    const deviceId = typeof input.deviceId === "string" ? input.deviceId.trim() : "";
    if (!deviceId) {
      return {
        ok: false, status: 400, code: "APP_UPDATE_REQUIRED",
        error: "Please update the HireMind app to mark attendance.",
      };
    }
    const deviceName = typeof input.deviceName === "string" ? input.deviceName.slice(0, 80) : null;

    const devices = await db
      .select()
      .from(employeeDevicesTable)
      .where(eq(employeeDevicesTable.employeeId, employeeId));

    // First device this employee ever uses is trusted automatically
    if (devices.length === 0) {
      await db.insert(employeeDevicesTable).values({
        adminId, employeeId, deviceId, deviceName, status: "approved",
      });
      return { ok: true };
    }

    const same = devices.find((d) => d.deviceId === deviceId);
    if (same?.status === "approved") return { ok: true };
    if (same?.status === "rejected") {
      return {
        ok: false, status: 403, code: "DEVICE_REJECTED",
        error: "This device was rejected by your admin. Please use your registered phone.",
      };
    }
    if (same?.status === "pending") {
      return {
        ok: false, status: 403, code: "DEVICE_PENDING",
        error: "Your device is waiting for admin approval.",
      };
    }

    // Unknown device → create a request and tell the admin
    await db.insert(employeeDevicesTable).values({
      adminId, employeeId, deviceId, deviceName, status: "pending",
    }).onConflictDoNothing();

    try {
      const [emp] = await db
        .select({ name: employeesTable.name })
        .from(employeesTable)
        .where(eq(employeesTable.id, employeeId));
      void notifyAdmin(adminId, {
        title: "Device verification request",
        body: `${emp?.name ?? "An employee"} is trying to mark attendance from a new phone`,
        screen: "/device-requests",
      });
    } catch (err) {
      logger.warn({ err }, "Device request notify failed");
    }

    return {
      ok: false, status: 403, code: "DEVICE_PENDING",
      error: "New device detected. A request was sent to your admin for approval.",
    };
  }

  return { ok: true };
}