import { pgTable, text, serial, timestamp, integer, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { employeesTable } from "./employees";

/** One referral code per person: per employee, or one for the company's admins. */
export const referralCodesTable = pgTable("referral_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").references(() => employeesTable.id, { onDelete: "cascade" }), // null = the company's admins
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique("referral_codes_code_unique").on(t.code)]);

export type ReferralCode = typeof referralCodesTable.$inferSelect;

/** One row per company that signed up with someone's code. */
export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  referrerAdminId: integer("referrer_admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  referrerEmployeeId: integer("referrer_employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  referredAdminId: integer("referred_admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  referredCompanyName: text("referred_company_name").notNull(),
  status: text("status").notNull().default("joined"), // "joined" | "rewarded" | "capped"
  rewardPaise: integer("reward_paise").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
}, (t) => [
  unique("referrals_referred_admin_id_unique").on(t.referredAdminId),
  index("referrals_referrer_idx").on(t.referrerAdminId),
]);

export type Referral = typeof referralsTable.$inferSelect;