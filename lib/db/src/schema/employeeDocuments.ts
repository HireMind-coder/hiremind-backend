import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { employeesTable } from "./employees";

/** Documents an employee (or the admin for them) uploads: Aadhaar, PAN, degree, etc. */
export const employeeDocumentsTable = pgTable("employee_documents", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(), // e.g. "PAN Card"
  fileName: text("file_name").notNull(), // name shown to people
  storedName: text("stored_name").notNull(), // random name on disk (never shown)
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "verified" | "rejected"
  uploadedBy: text("uploaded_by").notNull().default("employee"), // "employee" | "admin"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("employee_documents_employee_idx").on(t.employeeId)]);

export type EmployeeDocument = typeof employeeDocumentsTable.$inferSelect;