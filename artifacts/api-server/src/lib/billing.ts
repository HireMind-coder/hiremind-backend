import { db, pool, subscriptionsTable, employeesTable } from "@workspace/db";
import type { Subscription } from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  ADDONS,
  DEFAULT_FEATURES,
  DEFAULT_STAFF_LIMIT,
  DURATIONS,
  FEATURES,
  GST_RATE,
  STAFF_LIMITS,
  TRIAL_DAYS,
} from "./billingCatalog";

const DAY_MS = 24 * 60 * 60 * 1000;

// Tables are created at server start (Railway deploy has no `drizzle push` step)
export async function ensureBillingTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      staff_limit integer NOT NULL,
      features jsonb NOT NULL DEFAULT '[]'::jsonb,
      addons jsonb NOT NULL DEFAULT '[]'::jsonb,
      valid_till timestamptz NOT NULL,
      is_trial boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT subscriptions_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT subscriptions_admin_id_unique UNIQUE (admin_id)
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      type text NOT NULL,
      amount_paise integer NOT NULL,
      description text NOT NULL,
      reference text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT wallet_transactions_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS wallet_transactions_admin_time_idx ON wallet_transactions (admin_id, created_at);

    CREATE TABLE IF NOT EXISTS billing_details (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      invoice_type text NOT NULL DEFAULT 'gst',
      gstin text,
      bill_name text NOT NULL,
      address text NOT NULL,
      city text NOT NULL,
      state text NOT NULL,
      pincode text NOT NULL,
      country text NOT NULL DEFAULT 'India',
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT billing_details_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT billing_details_admin_id_unique UNIQUE (admin_id)
    );

    CREATE TABLE IF NOT EXISTS billing_invoices (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      invoice_number text NOT NULL,
      purchase_type text NOT NULL,
      subtotal_paise integer NOT NULL,
      gst_paise integer NOT NULL,
      total_paise integer NOT NULL,
      items jsonb NOT NULL,
      billing jsonb NOT NULL,
      valid_till timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT billing_invoices_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT billing_invoices_invoice_number_unique UNIQUE (invoice_number)
    );
    CREATE INDEX IF NOT EXISTS billing_invoices_admin_idx ON billing_invoices (admin_id);
  `);
  logger.info("Billing tables ready");
}

// ─── Subscription ───────────────────────────────────────────────────────────

export async function countActiveStaff(adminId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(employeesTable)
    .where(and(eq(employeesTable.adminId, adminId), eq(employeesTable.status, "active")));
  return Number(row?.n ?? 0);
}

/** Every company gets a free trial subscription the first time billing is opened. */
export async function getOrCreateSubscription(adminId: number): Promise<Subscription> {
  const find = async () =>
    (await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.adminId, adminId)).limit(1))[0];

  const existing = await find();
  if (existing) return existing;

  const active = await countActiveStaff(adminId);
  await db
    .insert(subscriptionsTable)
    .values({
      adminId,
      staffLimit: Math.max(DEFAULT_STAFF_LIMIT, active),
      features: DEFAULT_FEATURES,
      addons: [],
      validTill: new Date(Date.now() + TRIAL_DAYS * DAY_MS),
      isTrial: true,
    })
    .onConflictDoNothing();

  return (await find())!;
}

/**
 * Used by POST /employees: a company cannot add staff beyond its plan's staff limit.
 * OFF by default. Turn it on only when paid plans go live: set ENFORCE_STAFF_LIMIT=true on the server.
 */
export async function checkStaffLimit(adminId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.ENFORCE_STAFF_LIMIT !== "true") return { ok: true };

  const sub = await getOrCreateSubscription(adminId);
  const active = await countActiveStaff(adminId);
  if (active >= sub.staffLimit) {
    return {
      ok: false,
      error: `Your plan allows ${sub.staffLimit} active staff. Upgrade your plan in Settings → Subscriptions & Billing to add more.`,
    };
  }
  return { ok: true };
}

export async function getWalletBalancePaise(adminId: number): Promise<number> {
  const r = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_paise ELSE -amount_paise END), 0)::bigint AS bal
       FROM wallet_transactions WHERE admin_id = $1`,
    [adminId],
  );
  return Number(r.rows[0]?.bal ?? 0);
}

export function subscriptionStatus(validTill: Date): { status: "active" | "expiring" | "expired"; daysLeft: number } {
  const ms = validTill.getTime() - Date.now();
  const daysLeft = Math.ceil(ms / DAY_MS);
  if (ms <= 0) return { status: "expired", daysLeft: 0 };
  if (daysLeft <= 30) return { status: "expiring", daysLeft };
  return { status: "active", daysLeft };
}

// ─── Pricing ────────────────────────────────────────────────────────────────

export type PlanConfig = { staffLimit: number; features: string[]; addons: string[] };

export type OrderInput = PlanConfig & {
  type: "upgrade" | "renew";
  durationMonths: number;
};

export type Quote = {
  type: "upgrade" | "renew";
  durationMonths: number;
  lines: Array<{ label: string; amountPaise: number }>;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
  newValidTill: string;
};

const FEATURE_MAP = new Map(FEATURES.map((f) => [f.id, f]));
const ADDON_MAP = new Map(ADDONS.map((a) => [a.id, a]));

export function annualPaise(cfg: PlanConfig): number {
  const perStaff = cfg.features.reduce((sum, id) => sum + (FEATURE_MAP.get(id)?.pricePerStaffYear ?? 0), 0);
  const flat = cfg.addons.reduce((sum, id) => sum + (ADDON_MAP.get(id)?.priceYear ?? 0), 0);
  return Math.round((cfg.staffLimit * perStaff + flat) * 100);
}

/** Validates the request body of /billing/quote and /billing/checkout */
export function parseOrder(body: any): OrderInput | string {
  const type = body?.type === "upgrade" || body?.type === "renew" ? body.type : null;
  if (!type) return "type must be upgrade or renew";

  const staffLimit = Number(body?.staffLimit);
  if (!Number.isInteger(staffLimit) || staffLimit < 1) return "Choose a staff limit";

  const features: string[] = Array.isArray(body?.features) ? Array.from(new Set(body.features.map(String))) as string[] : [];
  const addons: string[] = Array.isArray(body?.addons) ? Array.from(new Set(body.addons.map(String))) as string[] : [];
  if (features.length === 0) return "Select at least one feature";
  if (features.some((id) => !FEATURE_MAP.has(id))) return "Unknown feature selected";
  if (addons.some((id) => !ADDON_MAP.has(id))) return "Unknown add-on selected";

  const durationMonths = body?.durationMonths === undefined ? 12 : Number(body.durationMonths);
  return { type, staffLimit, features, addons, durationMonths };
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

export function buildQuote(
  input: OrderInput,
  sub: Subscription,
  activeStaff: number,
): { ok: true; quote: Quote } | { ok: false; error: string } {
  const now = Date.now();

  if (!STAFF_LIMITS.includes(input.staffLimit) && input.staffLimit !== sub.staffLimit) {
    return { ok: false, error: "Choose one of the available staff limits" };
  }

  const lines: Quote["lines"] = [];
  let newValidTill = sub.validTill;
  let durationMonths = 12;

  if (input.type === "renew") {
    const duration = DURATIONS.find((d) => d.months === input.durationMonths);
    if (!duration) return { ok: false, error: "Choose a valid duration" };
    if (input.staffLimit < activeStaff) {
      return {
        ok: false,
        error: `You have ${activeStaff} active staff. Choose a staff limit of at least ${activeStaff}, or deactivate some staff first.`,
      };
    }
    durationMonths = duration.months;

    for (const id of input.features) {
      const f = FEATURE_MAP.get(id)!;
      lines.push({
        label: `${f.name} (${input.staffLimit} staff)`,
        amountPaise: Math.round((f.pricePerStaffYear * 100 * input.staffLimit * duration.months) / 12),
      });
    }
    for (const id of input.addons) {
      const a = ADDON_MAP.get(id)!;
      lines.push({ label: a.name, amountPaise: Math.round((a.priceYear * 100 * duration.months) / 12) });
    }
    if (duration.discountPercent > 0) {
      const base = lines.reduce((s, l) => s + l.amountPaise, 0);
      lines.push({
        label: `${duration.label} discount (${duration.discountPercent}%)`,
        amountPaise: -Math.round((base * duration.discountPercent) / 100),
      });
    }
    // Renewal extends from the current end date (or from today if the plan already expired)
    newValidTill = addMonths(new Date(Math.max(now, sub.validTill.getTime())), duration.months);
  } else {
    const validMs = sub.validTill.getTime();
    if (validMs <= now) return { ok: false, error: "Your plan has expired. Please renew it first." };
    if (input.staffLimit < sub.staffLimit) return { ok: false, error: "An upgrade cannot reduce the staff limit" };
    if (sub.features.some((id) => !input.features.includes(id)) || sub.addons.some((id) => !input.addons.includes(id))) {
      return { ok: false, error: "An upgrade can only add features and add-ons" };
    }

    const delta = annualPaise(input) - annualPaise({ staffLimit: sub.staffLimit, features: sub.features, addons: sub.addons });
    if (delta <= 0) return { ok: false, error: "Nothing to upgrade. Increase the staff limit or add a feature or add-on." };

    const fraction = Math.min(1, (validMs - now) / (365 * DAY_MS));
    const remainingDays = Math.ceil((validMs - now) / DAY_MS);
    const amount = Math.round(delta * fraction);
    if (amount <= 0) return { ok: false, error: "Nothing to pay for this upgrade" };

    lines.push({ label: `Plan upgrade (pro-rated for ${remainingDays} days)`, amountPaise: amount });
  }

  const subtotalPaise = lines.reduce((s, l) => s + l.amountPaise, 0);
  const gstPaise = Math.round(subtotalPaise * GST_RATE);

  return {
    ok: true,
    quote: {
      type: input.type,
      durationMonths,
      lines,
      subtotalPaise,
      gstPaise,
      totalPaise: subtotalPaise + gstPaise,
      newValidTill: newValidTill.toISOString(),
    },
  };
}