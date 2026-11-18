import {
  pgTable, text, serial, timestamp, integer, boolean, jsonb, unique, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** One row per company: what the company is currently paying for. */
export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  staffLimit: integer("staff_limit").notNull(),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  addons: jsonb("addons").$type<string[]>().notNull().default([]),
  validTill: timestamp("valid_till", { withTimezone: true }).notNull(),
  isTrial: boolean("is_trial").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique("subscriptions_admin_id_unique").on(t.adminId)]);

export type Subscription = typeof subscriptionsTable.$inferSelect;

/** Wallet ledger. Balance = sum of credits - sum of debits. Amounts are in paise. */
export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "credit" | "debit"
  amountPaise: integer("amount_paise").notNull(),
  description: text("description").notNull(),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("wallet_transactions_admin_time_idx").on(t.adminId, t.createdAt)]);

export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;

export const billingDetailsTable = pgTable("billing_details", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  invoiceType: text("invoice_type").notNull().default("gst"), // "gst" | "non_gst"
  gstin: text("gstin"),
  billName: text("bill_name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  pincode: text("pincode").notNull(),
  country: text("country").notNull().default("India"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique("billing_details_admin_id_unique").on(t.adminId)]);

export type BillingDetails = typeof billingDetailsTable.$inferSelect;

export const billingInvoicesTable = pgTable("billing_invoices", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull(),
  purchaseType: text("purchase_type").notNull(), // "upgrade" | "renewal"
  subtotalPaise: integer("subtotal_paise").notNull(),
  gstPaise: integer("gst_paise").notNull(),
  totalPaise: integer("total_paise").notNull(),
  items: jsonb("items").$type<any>().notNull(),
  billing: jsonb("billing").$type<any>().notNull(),
  validTill: timestamp("valid_till", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("billing_invoices_invoice_number_unique").on(t.invoiceNumber),
  index("billing_invoices_admin_idx").on(t.adminId),
]);

export type BillingInvoice = typeof billingInvoicesTable.$inferSelect;