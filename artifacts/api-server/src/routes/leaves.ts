import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { db } from "@workspace/db";
import { leavesTable, leaveBalancesTable, employeesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";
import { notifyAdmin, notifyEmployee } from "../lib/pushService";
import { getLeaveOptions, saveLeaveAttachment } from "../lib/leaveRules";

const router = Router();

async function ensureLeaveBalance(employeeId: number, year: number) {
  const [existing] = await db.select().from(leaveBalancesTable)
    .where(and(eq(leaveBalancesTable.employeeId, employeeId), eq(leaveBalancesTable.year, year)));
  if (!existing) {
    const [created] = await db.insert(leaveBalancesTable).values({ employeeId, year }).returning();
    return created;
  }
  return existing;
}

router.get("/leaves", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const adminId = req.user!.adminId;
  const { employeeId, status, year } = req.query;

  const employees = await db.select({ id: employeesTable.id })
    .from(employeesTable).where(eq(employeesTable.adminId, adminId));
  const empIds = employees.map(e => e.id);

  if (!empIds.length) { res.json([]); return; }

  let query = db.select({
    id: leavesTable.id,
    employeeId: leavesTable.employeeId,
    employeeName: employeesTable.name,
    type: leavesTable.type,
    startDate: leavesTable.startDate,
    endDate: leavesTable.endDate,
    days: leavesTable.days,
    halfDay: leavesTable.halfDay,
    attachmentUrl: leavesTable.attachmentUrl,
    reason: leavesTable.reason,
    status: leavesTable.status,
    approverNote: leavesTable.approverNote,
    createdAt: leavesTable.createdAt,
  }).from(leavesTable)
    .innerJoin(employeesTable, eq(leavesTable.employeeId, employeesTable.id))
    .where(
      inArray(leavesTable.employeeId, empIds)
    ).orderBy(desc(leavesTable.createdAt));

  const leaves = await query;

  let filtered = leaves;
  if (employeeId) filtered = filtered.filter(l => l.employeeId === Number(employeeId));
  if (status) filtered = filtered.filter(l => l.status === status);
  if (year) {
    const y = Number(year);
    filtered = filtered.filter(l => new Date(l.startDate).getFullYear() === y);
  }

  res.json(filtered);
});

router.post("/leaves", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const adminId = req.user!.adminId;
  const { employeeId, type, startDate, endDate, reason } = req.body;
  const halfDay = req.body.halfDay === true;

  if (!employeeId || !type || !startDate || !endDate) {
    res.status(400).json({ error: "employeeId, type, startDate, endDate are required" });
    return;
  }

  const isDate = (s: unknown) =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
  if (!isDate(startDate) || !isDate(endDate)) {
    res.status(400).json({ error: "Dates must be in YYYY-MM-DD format" });
    return;
  }
  if (endDate < startDate) {
    res.status(400).json({ error: "To date cannot be before From date" });
    return;
  }
  if (halfDay && startDate !== endDate) {
    res.status(400).json({ error: "A half-day leave must be for a single date" });
    return;
  }

  const [emp] = await db.select().from(employeesTable)
    .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.adminId, adminId)));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

  const msPerDay = 1000 * 60 * 60 * 24;
  const days = halfDay
    ? 0.5
    : Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / msPerDay) + 1;
  const year = new Date(startDate).getFullYear();

  await ensureLeaveBalance(employeeId, year);

  let leaveType: string = type;

  // Extra checks when an employee asks for their own leave
  if (req.user!.role === "employee") {
    const overlapping = await db.select({ id: leavesTable.id }).from(leavesTable)
      .where(and(
        eq(leavesTable.employeeId, employeeId),
        inArray(leavesTable.status, ["pending", "approved"]),
        lte(leavesTable.startDate, endDate),
        gte(leavesTable.endDate, startDate),
      )).limit(1);
    if (overlapping.length > 0) {
      res.status(409).json({ error: "You already have a leave request for these dates" });
      return;
    }

    const options = await getLeaveOptions(adminId, employeeId, year);
    const option = options.find((o) => o.key.toLowerCase() === String(type).toLowerCase());
    if (!option) { res.status(400).json({ error: "Invalid leave type" }); return; }
    if (option.balance != null && days > option.balance) {
      res.status(400).json({ error: `Not enough ${option.name} balance. You have ${option.balance} day(s) left.` });
      return;
    }
    leaveType = option.key;
  }

  let attachmentUrl: string | null = null;
  if (req.body.attachmentBase64) {
    const saved = saveLeaveAttachment(req.body.attachmentBase64);
    if ("error" in saved) { res.status(400).json({ error: saved.error }); return; }
    attachmentUrl = saved.url;
  }

  const [leave] = await db.insert(leavesTable).values({
    employeeId,
    type: leaveType,
    startDate,
    endDate,
    days,
    halfDay,
    attachmentUrl,
    reason: reason || null,
    status: "pending",
  }).returning();

  if (req.user!.role === 'employee') {
    void notifyAdmin(adminId, {
      title: 'New leave request',
      body: `${emp.name} requested ${halfDay ? "a half day" : `${days} day(s)`} of ${leaveType} leave`,
      screen: '/leaves',
    });
  }

  res.status(201).json(leave);
});

router.patch("/leaves/:id/approve", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const adminId = req.user!.adminId;
  const { id } = req.params;
  const { approverNote } = req.body;

  const [leave] = await db.select().from(leavesTable).where(eq(leavesTable.id, Number(id)));
  if (!leave) { res.status(404).json({ error: "Leave not found" }); return; }

  const [emp] = await db.select().from(employeesTable)
    .where(and(eq(employeesTable.id, leave.employeeId), eq(employeesTable.adminId, adminId)));
  if (!emp) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(leavesTable).set({
    status: "approved",
    approvedBy: req.user!.userId,
    approverNote: approverNote || null,
    updatedAt: new Date(),
  }).where(eq(leavesTable.id, Number(id))).returning();

  const year = new Date(leave.startDate).getFullYear();
  const balance = await ensureLeaveBalance(leave.employeeId, year);
  const typeKey = leave.type.toLowerCase() as "casual" | "sick" | "earned";
  const usedKey = `${typeKey}Used` as "casualUsed" | "sickUsed" | "earnedUsed";
  if (usedKey in balance) {
    await db.update(leaveBalancesTable).set({
      [usedKey]: (balance[usedKey] || 0) + leave.days,
      updatedAt: new Date(),
    }).where(and(
      eq(leaveBalancesTable.employeeId, leave.employeeId),
      eq(leaveBalancesTable.year, year)
    ));
  }
  void notifyEmployee(leave.employeeId, {
    title: 'Leave approved',
    body: `Your ${leave.type} leave (${leave.startDate} to ${leave.endDate}) was approved`,
    screen: '/(employee)/leaves',
  });

  res.json(updated);
});

router.patch("/leaves/:id/reject", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const adminId = req.user!.adminId;
  const { id } = req.params;
  const { approverNote } = req.body;

  const [leave] = await db.select().from(leavesTable).where(eq(leavesTable.id, Number(id)));
  if (!leave) { res.status(404).json({ error: "Leave not found" }); return; }

  const [emp] = await db.select().from(employeesTable)
    .where(and(eq(employeesTable.id, leave.employeeId), eq(employeesTable.adminId, adminId)));
  if (!emp) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(leavesTable).set({
    status: "rejected",
    approvedBy: req.user!.userId,
    approverNote: approverNote || null,
    updatedAt: new Date(),
  }).where(eq(leavesTable.id, Number(id))).returning();

  void notifyEmployee(leave.employeeId, {
    title: 'Leave rejected',
    body: `Your ${leave.type} leave (${leave.startDate} to ${leave.endDate}) was rejected`,
    screen: '/(employee)/leaves',
  });

  res.json(updated);
});

router.delete("/leaves/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const adminId = req.user!.adminId;
  const { id } = req.params;

  const [leave] = await db.select().from(leavesTable).where(eq(leavesTable.id, Number(id)));
  if (!leave) { res.status(404).json({ error: "Leave not found" }); return; }

  const [emp] = await db.select().from(employeesTable)
    .where(and(eq(employeesTable.id, leave.employeeId), eq(employeesTable.adminId, adminId)));
  if (!emp) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(leavesTable).where(eq(leavesTable.id, Number(id)));
  res.status(204).send();
});

router.get("/leaves/balances", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const adminId = req.user!.adminId;
  const year = Number(req.query.year) || new Date().getFullYear();

  const employees = await db.select().from(employeesTable)
    .where(eq(employeesTable.adminId, adminId));

  const balances = await Promise.all(employees.map(async emp => {
    const balance = await ensureLeaveBalance(emp.id, year);
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      year,
      casual: balance.casual,
      sick: balance.sick,
      earned: balance.earned,
      casualUsed: balance.casualUsed,
      sickUsed: balance.sickUsed,
      earnedUsed: balance.earnedUsed,
      casualRemaining: balance.casual - balance.casualUsed,
      sickRemaining: balance.sick - balance.sickUsed,
      earnedRemaining: balance.earned - balance.earnedUsed,
    };
  }));

  res.json(balances);
});

export default router;
