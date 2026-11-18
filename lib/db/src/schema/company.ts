import {
  pgTable, text, serial, timestamp, integer, doublePrecision, unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Extra company details (name itself stays in users.company_name). One row per company. */
export const companyProfilesTable = pgTable("company_profiles", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  companyCode: text("company_code").notNull(),
  businessType: text("business_type"),
  address: text("address"),
  gstNumber: text("gst_number"),
  udyamNumber: text("udyam_number"),
  logoUrl: text("logo_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("company_profiles_admin_id_unique").on(t.adminId),
  unique("company_profiles_company_code_unique").on(t.companyCode),
]);

export type CompanyProfile = typeof companyProfilesTable.$inferSelect;

export const branchesTable = pgTable("branches", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  radius: integer("radius").notNull().default(100), // metres
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Branch = typeof branchesTable.$inferSelect;

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique("departments_admin_name_unique").on(t.adminId, t.name)]);

export type Department = typeof departmentsTable.$inferSelect;