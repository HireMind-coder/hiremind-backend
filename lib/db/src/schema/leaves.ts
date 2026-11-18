import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const leavesTable = pgTable("leaves", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: real("days").notNull().default(1), // 0.5 for a half day
  halfDay: boolean("half_day").notNull().default(false),
  attachmentUrl: text("attachment_url"),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  approvedBy: integer("approved_by"),
  approverNote: text("approver_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLeaveSchema = createInsertSchema(leavesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeave = z.infer<typeof insertLeaveSchema>;
export type Leave = typeof leavesTable.$inferSelect;

export const leaveBalancesTable = pgTable("leave_balances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  casual: integer("casual").notNull().default(12),
  sick: integer("sick").notNull().default(7),
  earned: integer("earned").notNull().default(15),
  casualUsed: real("casual_used").notNull().default(0),
  sickUsed: real("sick_used").notNull().default(0),
  earnedUsed: real("earned_used").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LeaveBalance = typeof leaveBalancesTable.$inferSelect;
