import { Router } from "express";
import {
  db,
  attendanceSettingsTable,
  customLeaveTypesTable,
  holidaysTable,
  employeeDevicesTable,
  employeesTable,
} from "@workspace/db";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getAttendanceSettings } from "../lib/attendanceRules";
import { getPublicHolidaySuggestions } from "../lib/publicHolidays";
import { notifyEmployee } from "../lib/pushService";

const router = Router();

const BASE = "/attendance-settings";

function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function shapeSettings(s: Awaited<ReturnType<typeof getAttendanceSettings>>) {
  return {
    geofenceEnabled: s.geofenceEnabled,
    geofenceLat: s.geofenceLat,
    geofenceLng: s.geofenceLng,
    geofenceRadius: s.geofenceRadius,
    deviceVerification: s.deviceVerification,
    blockFakeGps: s.blockFakeGps,
    autoLiveTrack: s.autoLiveTrack,
  };
}

// ─── Settings (toggles + geofence) ──────────────────────────────────────────

router.get(BASE, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  res.json(shapeSettings(await getAttendanceSettings(adminId)));
});

router.put(BASE, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};

 for (const key of ["geofenceEnabled", "deviceVerification", "blockFakeGps", "autoLiveTrack"] as const) {
    if (b[key] !== undefined) {
      if (typeof b[key] !== "boolean") { res.status(400).json({ error: `${key} must be true or false` }); return; }
      patch[key] = b[key];
    }
  }

  if (b.geofenceLat !== undefined || b.geofenceLng !== undefined) {
    const lat = Number(b.geofenceLat);
    const lng = Number(b.geofenceLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      res.status(400).json({ error: "Enter a valid latitude (-90 to 90) and longitude (-180 to 180)" });
      return;
    }
    patch.geofenceLat = lat;
    patch.geofenceLng = lng;
  }

  if (b.geofenceRadius !== undefined) {
    const r = Math.round(Number(b.geofenceRadius));
    if (!Number.isFinite(r) || r < 20 || r > 5000) {
      res.status(400).json({ error: "Radius must be between 20 and 5000 metres" });
      return;
    }
    patch.geofenceRadius = r;
  }

  const current = await getAttendanceSettings(adminId);
  const willEnableGeofence = patch.geofenceEnabled === true || (patch.geofenceEnabled === undefined && current.geofenceEnabled);
  const lat = (patch.geofenceLat as number | undefined) ?? current.geofenceLat;
  const lng = (patch.geofenceLng as number | undefined) ?? current.geofenceLng;
  if (willEnableGeofence && (lat == null || lng == null)) {
    res.status(400).json({ error: "Set the office location before turning on the geofence" });
    return;
  }

  const [row] = await db
    .insert(attendanceSettingsTable)
    .values({ adminId, ...patch })
    .onConflictDoUpdate({
      target: attendanceSettingsTable.adminId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();

  res.json(shapeSettings(row));
});

// ─── Custom paid leaves ─────────────────────────────────────────────────────

router.get(`${BASE}/leave-types`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const rows = await db
    .select()
    .from(customLeaveTypesTable)
    .where(eq(customLeaveTypesTable.adminId, adminId))
    .orderBy(asc(customLeaveTypesTable.name));
  res.json(rows);
});

function parseLeaveBody(body: any): { name: string; daysPerYear: number; color: string } | string {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 40) return "Leave name is required (max 40 characters)";
  const days = body?.daysPerYear === undefined || body?.daysPerYear === "" ? 0 : Number(body.daysPerYear);
  if (!Number.isInteger(days) || days < 0 || days > 365) return "Days per year must be a whole number from 0 to 365";
  const color = typeof body?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "#F59E0B";
  return { name, daysPerYear: days, color };
}

router.post(`${BASE}/leave-types`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const parsed = parseLeaveBody(req.body);
  if (typeof parsed === "string") { res.status(400).json({ error: parsed }); return; }

  const existing = await db.select().from(customLeaveTypesTable).where(eq(customLeaveTypesTable.adminId, adminId));
  if (existing.some((l) => l.name.toLowerCase() === parsed.name.toLowerCase())) {
    res.status(409).json({ error: "A leave with this name already exists" });
    return;
  }

  const [row] = await db.insert(customLeaveTypesTable).values({ adminId, ...parsed }).returning();
  res.status(201).json(row);
});

router.patch(`${BASE}/leave-types/:id`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const parsed = parseLeaveBody(req.body);
  if (typeof parsed === "string") { res.status(400).json({ error: parsed }); return; }

  const all = await db.select().from(customLeaveTypesTable).where(eq(customLeaveTypesTable.adminId, adminId));
  if (!all.some((l) => l.id === id)) { res.status(404).json({ error: "Leave not found" }); return; }
  if (all.some((l) => l.id !== id && l.name.toLowerCase() === parsed.name.toLowerCase())) {
    res.status(409).json({ error: "A leave with this name already exists" });
    return;
  }

  const [row] = await db
    .update(customLeaveTypesTable)
    .set(parsed)
    .where(and(eq(customLeaveTypesTable.id, id), eq(customLeaveTypesTable.adminId, adminId)))
    .returning();
  res.json(row);
});

router.delete(`${BASE}/leave-types/:id`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const deleted = await db
    .delete(customLeaveTypesTable)
    .where(and(eq(customLeaveTypesTable.id, id), eq(customLeaveTypesTable.adminId, adminId)))
    .returning({ id: customLeaveTypesTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Leave not found" }); return; }
  res.status(204).send();
});

// ─── Holiday list ───────────────────────────────────────────────────────────

router.get(`${BASE}/holidays`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const year = Number(req.query.year) || new Date().getFullYear();
  const rows = await db
    .select()
    .from(holidaysTable)
    .where(and(eq(holidaysTable.adminId, adminId), like(holidaysTable.date, `${year}-%`)))
    .orderBy(asc(holidaysTable.date));
  res.json(rows);
});

router.get(`${BASE}/holidays/suggestions`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const year = Number(req.query.year) || new Date().getFullYear();
  const added = await db
    .select({ date: holidaysTable.date })
    .from(holidaysTable)
    .where(and(eq(holidaysTable.adminId, adminId), like(holidaysTable.date, `${year}-%`)));
  const addedDates = new Set(added.map((h) => h.date));
  res.json(getPublicHolidaySuggestions(year).map((h) => ({ ...h, added: addedDates.has(h.date) })));
});

router.post(`${BASE}/holidays`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const { date, name } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!isValidDate(date)) { res.status(400).json({ error: "Date must be in YYYY-MM-DD format" }); return; }
  if (!cleanName || cleanName.length > 80) { res.status(400).json({ error: "Holiday name is required (max 80 characters)" }); return; }

  const [row] = await db
    .insert(holidaysTable)
    .values({ adminId, date, name: cleanName })
    .onConflictDoUpdate({ target: [holidaysTable.adminId, holidaysTable.date], set: { name: cleanName } })
    .returning();
  res.status(201).json(row);
});

router.post(`${BASE}/holidays/bulk`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const list = Array.isArray(req.body?.holidays) ? req.body.holidays : [];
  const clean = list
    .filter((h: any) => isValidDate(h?.date) && typeof h?.name === "string" && h.name.trim())
    .slice(0, 100)
    .map((h: any) => ({ adminId, date: h.date as string, name: String(h.name).trim().slice(0, 80) }));
  if (clean.length === 0) { res.status(400).json({ error: "No valid holidays to add" }); return; }

  const inserted = await db.insert(holidaysTable).values(clean).onConflictDoNothing().returning();
  res.status(201).json({ added: inserted.length });
});

router.delete(`${BASE}/holidays/:id`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const deleted = await db
    .delete(holidaysTable)
    .where(and(eq(holidaysTable.id, id), eq(holidaysTable.adminId, adminId)))
    .returning({ id: holidaysTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Holiday not found" }); return; }
  res.status(204).send();
});

// ─── Device verification requests ───────────────────────────────────────────

router.get(`${BASE}/devices`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const rows = await db
    .select({
      id: employeeDevicesTable.id,
      employeeId: employeeDevicesTable.employeeId,
      employeeName: employeesTable.name,
      deviceId: employeeDevicesTable.deviceId,
      deviceName: employeeDevicesTable.deviceName,
      status: employeeDevicesTable.status,
      createdAt: employeeDevicesTable.createdAt,
    })
    .from(employeeDevicesTable)
    .innerJoin(employeesTable, eq(employeeDevicesTable.employeeId, employeesTable.id))
    .where(eq(employeeDevicesTable.adminId, adminId))
    .orderBy(desc(employeeDevicesTable.createdAt));
  res.json(rows);
});

router.patch(`${BASE}/devices/:id`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (status !== "approved" && status !== "rejected") {
    res.status(400).json({ error: "status must be approved or rejected" });
    return;
  }

  const [row] = await db
    .update(employeeDevicesTable)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(employeeDevicesTable.id, id), eq(employeeDevicesTable.adminId, adminId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  void notifyEmployee(row.employeeId, {
    title: status === "approved" ? "Device approved" : "Device rejected",
    body: status === "approved"
      ? "Your phone was approved. You can mark attendance now."
      : "Your phone was rejected by the admin.",
    screen: "/(employee)/attendance",
  });

  res.json(row);
});

// Removing a device lets the employee register a new phone from scratch
router.delete(`${BASE}/devices/:id`, requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const deleted = await db
    .delete(employeeDevicesTable)
    .where(and(eq(employeeDevicesTable.id, id), eq(employeeDevicesTable.adminId, adminId)))
    .returning({ id: employeeDevicesTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Device not found" }); return; }
  res.status(204).send();
});

export default router;