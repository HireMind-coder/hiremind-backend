import { db, pool, leavesTable, leaveBalancesTable, customLeaveTypesTable } from "@workspace/db";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import path from "path";
import { mkdirSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { logger } from "./logger";

// Runs at server start: adds the new leave columns and lets "days" hold half days (0.5)
export async function ensureLeaveColumns(): Promise<void> {
  await pool.query(`
    ALTER TABLE leaves ADD COLUMN IF NOT EXISTS half_day boolean NOT NULL DEFAULT false;
    ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_url text;

    DO $$
    BEGIN
      IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'leaves' AND column_name = 'days') = 'integer' THEN
        ALTER TABLE leaves ALTER COLUMN days TYPE real;
      END IF;
      IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'leave_balances' AND column_name = 'casual_used') = 'integer' THEN
        ALTER TABLE leave_balances ALTER COLUMN casual_used TYPE real;
      END IF;
      IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'leave_balances' AND column_name = 'sick_used') = 'integer' THEN
        ALTER TABLE leave_balances ALTER COLUMN sick_used TYPE real;
      END IF;
      IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'leave_balances' AND column_name = 'earned_used') = 'integer' THEN
        ALTER TABLE leave_balances ALTER COLUMN earned_used TYPE real;
      END IF;
    END $$;
  `);
  logger.info("Leave columns ready");
}

export type LeaveOption = {
  /** What is stored in leaves.type */
  key: string;
  name: string;
  color: string;
  /** null = no fixed quota (unlimited) */
  quota: number | null;
  used: number;
  pending: number;
  /** Days still available to request (null when there is no quota) */
  balance: number | null;
};

/**
 * The leave types an employee can pick, with their balance for the year.
 * - If the admin created "Custom Paid Leaves" they are used; otherwise Casual / Sick / Earned.
 * - "Unpaid Leave" is always available.
 * Balance = yearly quota - approved days - days still waiting for approval.
 */
export async function getLeaveOptions(adminId: number, employeeId: number, year: number): Promise<LeaveOption[]> {
  const custom = await db
    .select()
    .from(customLeaveTypesTable)
    .where(eq(customLeaveTypesTable.adminId, adminId))
    .orderBy(asc(customLeaveTypesTable.name));

  const [bal] = await db
    .select()
    .from(leaveBalancesTable)
    .where(and(eq(leaveBalancesTable.employeeId, employeeId), eq(leaveBalancesTable.year, year)));

  const defs: Array<{ key: string; name: string; color: string; quota: number | null }> =
    custom.length > 0
      ? custom.map((c) => ({ key: c.name, name: c.name, color: c.color, quota: c.daysPerYear > 0 ? c.daysPerYear : null }))
      : [
          { key: "casual", name: "Casual Leave", color: "#F59E0B", quota: bal?.casual ?? 12 },
          { key: "sick", name: "Sick Leave", color: "#10B981", quota: bal?.sick ?? 7 },
          { key: "earned", name: "Earned Leave", color: "#3B82F6", quota: bal?.earned ?? 15 },
        ];
  defs.push({ key: "unpaid", name: "Unpaid Leave", color: "#6B7280", quota: null });

  const usage = await db
    .select({
      type: leavesTable.type,
      status: leavesTable.status,
      days: sql<number>`COALESCE(SUM(${leavesTable.days}), 0)`,
    })
    .from(leavesTable)
    .where(
      and(
        eq(leavesTable.employeeId, employeeId),
        inArray(leavesTable.status, ["approved", "pending"]),
        like(leavesTable.startDate, `${year}-%`),
      ),
    )
    .groupBy(leavesTable.type, leavesTable.status);

  const sumFor = (key: string, status: string) =>
    usage
      .filter((u) => u.type.toLowerCase() === key.toLowerCase() && u.status === status)
      .reduce((s, u) => s + Number(u.days), 0);

  return defs.map((d) => {
    const used = sumFor(d.key, "approved");
    const pending = sumFor(d.key, "pending");
    return {
      ...d,
      used,
      pending,
      balance: d.quota == null ? null : Math.max(0, d.quota - used - pending),
    };
  });
}

const LEAVE_DIR = path.join(process.cwd(), "uploads", "leaves");

/** Saves a leave attachment (photo of a medical certificate etc.) and returns its URL. */
export function saveLeaveAttachment(base64: unknown): { url: string } | { error: string } {
  const raw = typeof base64 === "string" ? base64 : "";
  const clean = raw.replace(/^data:image\/\w+;base64,/, "");
  if (!clean) return { error: "Attachment is empty" };

  const buf = Buffer.from(clean, "base64");
  if (buf.length === 0 || buf.length > 3 * 1024 * 1024) return { error: "Attachment must be smaller than 3 MB" };

  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!isPng && !isJpg) return { error: "Only PNG or JPG images are allowed" };

  mkdirSync(LEAVE_DIR, { recursive: true });
  const filename = `leave-${randomUUID()}.${isPng ? "png" : "jpg"}`;
  writeFileSync(path.join(LEAVE_DIR, filename), buf);
  return { url: `/api/uploads/leaves/${filename}` };
}