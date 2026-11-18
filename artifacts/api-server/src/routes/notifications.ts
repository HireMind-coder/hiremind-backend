import { Router } from "express";
import { db, employeesTable, attendanceTable, leavesTable, tasksTable, paymentsTable } from "@workspace/db";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { buildFeed, localKey, type FeedType } from "../lib/notificationFeed";

const router = Router();

// Times in the feed are shown in this timezone. Change with APP_TIMEZONE in .env.
const TIME_ZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";
const TYPES: FeedType[] = ["attendance", "leave", "task", "payment"];

// GET /api/notifications?type=attendance&employeeIds=1,2&days=30
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const me = (req as any).user;
  if (me.role === "employee") {
    res.status(403).json({ error: "Admins only" });
    return;
  }
  const adminId: number = me.adminId;

  const type = TYPES.includes(req.query.type as FeedType) ? (req.query.type as FeedType) : null;
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 1), 365);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "300"), 10) || 300, 1), 1000);
  const wanted = new Set(
    String(req.query.employeeIds ?? "")
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0),
  );

  const employees = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.adminId, adminId));

  let ids = employees.map((e) => e.id);
  if (wanted.size > 0) ids = ids.filter((id) => wanted.has(id));
  if (ids.length === 0) {
    res.json({ items: [], hasMore: false, days });
    return;
  }

  const names = new Map(employees.map((e) => [e.id, e.name]));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceKey = localKey(since, TIME_ZONE);
  const sinceDate = sinceKey.slice(0, 10);

  const want = (t: FeedType) => !type || type === t;

  const [attendance, leaves, tasks, payments] = await Promise.all([
    want("attendance")
      ? db.select().from(attendanceTable)
          .where(and(inArray(attendanceTable.employeeId, ids), gte(attendanceTable.date, sinceDate)))
      : Promise.resolve([]),
    want("leave")
      ? db.select().from(leavesTable)
          .where(and(
            inArray(leavesTable.employeeId, ids),
            or(gte(leavesTable.createdAt, since), gte(leavesTable.updatedAt, since)),
          ))
      : Promise.resolve([]),
    want("task")
      ? db.select().from(tasksTable)
          .where(and(inArray(tasksTable.employeeId, ids), gte(tasksTable.createdAt, since)))
      : Promise.resolve([]),
    want("payment")
      ? db.select().from(paymentsTable)
          .where(and(
            inArray(paymentsTable.employeeId, ids),
            or(gte(paymentsTable.createdAt, since), gte(paymentsTable.paidAt, since)),
          ))
      : Promise.resolve([]),
  ]);

  const { items, hasMore } = buildFeed({
    names, attendance, leaves, tasks, payments, type, sinceKey, limit, timeZone: TIME_ZONE,
  });

  res.json({ items, hasMore, days });
});

export default router;