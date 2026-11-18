import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { employeesTable } from "./employees";

export const pushTokensTable = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userType: text("user_type").notNull(), // "admin" | "employee"
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").references(() => employeesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PushToken = typeof pushTokensTable.$inferSelect;