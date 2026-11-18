import { Router } from "express";
import { db, pool, attendanceTable, locationPingsTable } from "@workspace/db";
import { and, asc, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getAttendanceSettings } from "../lib/attendanceRules";

const router = Router();

const TRACK_HOURS = 12;
const HOUR_MS = 60 * 60 * 1000;

function dayString(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * HOUR_MS).toISOString().slice(0, 10);
}

// ─── Employee app asks: should I track after punch-in? ──────────────────────
router.get("/live-track/config", requireAuth, async (req, res): Promise<void> => {
  const { adminId, role, employeeId } = (req as any).user;
  const s = await getAttendanceSettings(adminId);
  res.json({
    enabled: s.autoLiveTrack,
    hours: TRACK_HOURS,
    employeeId: role === "employee" ? Number(employeeId) : null,
  });
});

// ─── Employee phone sends location points (works in background) ─────────────
router.post("/live-track/ping", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "employee") {
    res.status(403).json({ error: "Only employees can send location" });
    return;
  }
  const adminId = Number(user.adminId);
  const employeeId = Number(user.employeeId);

  const s = await getAttendanceSettings(adminId);
  if (!s.autoLiveTrack) {
    res.json({ tracking: false });
    return;
  }

  // Tracking runs only while the employee is punched in (checked in, not yet checked out)
  const [open] = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.employeeId, employeeId),
        eq(attendanceTable.status, "present"),
        gte(attendanceTable.date, dayString(-1)),
        isNotNull(attendanceTable.checkIn),
        isNull(attendanceTable.checkOut),
      ),
    )
    .orderBy(desc(attendanceTable.date))
    .limit(1);

  if (!open) {
    res.json({ tracking: false });
    return;
  }

  // Hard stop: 12 hours after the first point of this punch-in
  const [first] = await db
    .select({ createdAt: locationPingsTable.createdAt })
    .from(locationPingsTable)
    .where(eq(locationPingsTable.attendanceId, open.id))
    .orderBy(asc(locationPingsTable.createdAt))
    .limit(1);
  if (first && Date.now() - first.createdAt.getTime() > TRACK_HOURS * HOUR_MS) {
    res.json({ tracking: false });
    return;
  }

  const raw = Array.isArray(req.body?.points) ? req.body.points.slice(0, 50) : [];
  const now = Date.now();
  const rows: Array<typeof locationPingsTable.$inferInsert> = [];

  for (const p of raw) {
    const lat = Number(p?.latitude);
    const lng = Number(p?.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) continue;
    if (s.blockFakeGps && p?.mocked === true) continue;

    const ts = Number(p?.recordedAt);
    const when =
      Number.isFinite(ts) && ts > now - 24 * HOUR_MS && ts < now + 5 * 60 * 1000 ? new Date(ts) : new Date(now);
    const acc = p?.accuracy == null ? null : Number(p.accuracy);

    rows.push({
      adminId,
      employeeId,
      attendanceId: open.id,
      latitude: lat,
      longitude: lng,
      accuracy: acc != null && Number.isFinite(acc) ? acc : null,
      recordedAt: when,
    });
  }

  if (rows.length > 0) await db.insert(locationPingsTable).values(rows);
  res.json({ tracking: true, saved: rows.length });
});

// ─── Admin: latest known location of every employee tracked in the last 12 h ─
router.get("/live-track/live", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (p.employee_id)
        p.employee_id AS "employeeId",
        e.name        AS "employeeName",
        e.role        AS "role",
        p.latitude, p.longitude, p.accuracy,
        p.recorded_at AS "recordedAt"
       FROM location_pings p
       JOIN employees e ON e.id = p.employee_id
      WHERE p.admin_id = $1
        AND p.recorded_at > now() - interval '12 hours'
      ORDER BY p.employee_id, p.recorded_at DESC`,
    [adminId],
  );
  rows.sort((a: any, b: any) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  res.json(rows);
});

export default router;