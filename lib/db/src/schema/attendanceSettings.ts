import {
  pgTable, text, serial, timestamp, integer, boolean, doublePrecision, unique, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { employeesTable } from "./employees";

/** One row per company (adminId = the owner's users.id) */
export const attendanceSettingsTable = pgTable("attendance_settings", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  geofenceEnabled: boolean("geofence_enabled").notNull().default(false),
  geofenceLat: doublePrecision("geofence_lat"),
  geofenceLng: doublePrecision("geofence_lng"),
  geofenceRadius: integer("geofence_radius").notNull().default(100), // metres
  deviceVerification: boolean("device_verification").notNull().default(false),
  blockFakeGps: boolean("block_fake_gps").notNull().default(false),
  autoLiveTrack: boolean("auto_live_track").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique("attendance_settings_admin_id_unique").on(t.adminId)]);

export type AttendanceSettings = typeof attendanceSettingsTable.$inferSelect;

export const customLeaveTypesTable = pgTable("custom_leave_types", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  daysPerYear: integer("days_per_year").notNull().default(0), // 0 = no fixed quota
  color: text("color").notNull().default("#F59E0B"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CustomLeaveType = typeof customLeaveTypesTable.$inferSelect;

export const holidaysTable = pgTable("holidays", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique("holidays_admin_date_unique").on(t.adminId, t.date)]);

export type Holiday = typeof holidaysTable.$inferSelect;

export const employeeDevicesTable = pgTable("employee_devices", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  deviceName: text("device_name"),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique("employee_devices_employee_device_unique").on(t.employeeId, t.deviceId)]);

export type EmployeeDevice = typeof employeeDevicesTable.$inferSelect;


/** Auto-Live Track: location points sent from the employee's phone after punch-in */
export const locationPingsTable = pgTable("location_pings", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  attendanceId: integer("attendance_id"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracy: doublePrecision("accuracy"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("location_pings_employee_time_idx").on(t.employeeId, t.recordedAt)]);

export type LocationPing = typeof locationPingsTable.$inferSelect;
