import {
  db,
  pool,
  usersTable,
  employeesTable,
  referralCodesTable,
  referralsTable,
  walletTransactionsTable,
} from "@workspace/db";
import { and, count, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Referral rules. !! These numbers are PLACEHOLDERS — set your real offer here. !!
//
// How it works:
//  1. Someone shares their referral code.
//  2. A friend signs up a NEW company with that code  -> referral status "joined".
//  3. When that new company pays for its first plan    -> the referrer's COMPANY
//     wallet gets the reward (visible in Subscriptions & Billing -> Wallet History).
// ─────────────────────────────────────────────────────────────────────────────
export const REFERRAL_RULES = {
  rewardPaise: 500 * 100, // ₹500 credited to the referrer's company wallet
  minPurchasePaise: 1000 * 100, // the friend's plan must be at least ₹1,000 (before GST)
  maxRewardsPerCompany: 20, // stops abuse; extra referrals are marked "capped"
};

// Tables are created at server start (Railway deploy has no `drizzle push` step)
export async function ensureReferralTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id serial PRIMARY KEY,
      code text NOT NULL,
      admin_id integer NOT NULL,
      employee_id integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT referral_codes_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT referral_codes_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      CONSTRAINT referral_codes_code_unique UNIQUE (code)
    );
    -- one code per employee, and one code for the company's admins
    CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_owner_unique ON referral_codes (admin_id, (COALESCE(employee_id, 0)));

    CREATE TABLE IF NOT EXISTS referrals (
      id serial PRIMARY KEY,
      code text NOT NULL,
      referrer_admin_id integer NOT NULL,
      referrer_employee_id integer,
      referred_admin_id integer NOT NULL,
      referred_company_name text NOT NULL,
      status text NOT NULL DEFAULT 'joined',
      reward_paise integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      rewarded_at timestamptz,
      CONSTRAINT referrals_referrer_admin_id_users_id_fk FOREIGN KEY (referrer_admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT referrals_referrer_employee_id_employees_id_fk FOREIGN KEY (referrer_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
      CONSTRAINT referrals_referred_admin_id_users_id_fk FOREIGN KEY (referred_admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT referrals_referred_admin_id_unique UNIQUE (referred_admin_id)
    );
    CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_admin_id);
  `);
  logger.info("Referral tables ready");
}

// No 0/O/1/I so a code is easy to read out loud
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  let tail = "";
  for (let i = 0; i < 5; i++) tail += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `HM${tail}`;
}

export function normalizeCode(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The caller's own code (created the first time). employeeId = null means "the company's admins". */
export async function getOrCreateReferralCode(adminId: number, employeeId: number | null) {
  const find = async () =>
    (
      await db
        .select()
        .from(referralCodesTable)
        .where(
          and(
            eq(referralCodesTable.adminId, adminId),
            employeeId == null ? isNull(referralCodesTable.employeeId) : eq(referralCodesTable.employeeId, employeeId),
          ),
        )
        .limit(1)
    )[0];

  const existing = await find();
  if (existing) return existing;

  for (let i = 0; i < 8; i++) {
    // onConflictDoNothing covers "someone created it at the same moment" and "code already taken"
    await db.insert(referralCodesTable).values({ code: makeCode(), adminId, employeeId }).onConflictDoNothing();
    const row = await find();
    if (row) return row;
  }
  throw new Error("Could not create a referral code");
}

export type ValidReferral = {
  ok: true;
  code: string;
  referrerAdminId: number;
  referrerEmployeeId: number | null;
};
export type ReferralCheck = ValidReferral | { ok: false; error: string };

/** Used at sign-up: is this code real, and is it not the person's own code? */
export async function validateReferralCode(rawCode: unknown, newEmail: string): Promise<ReferralCheck> {
  const code = normalizeCode(rawCode);
  if (code.length < 4) return { ok: false, error: "This referral code is not valid" };

  const [row] = await db.select().from(referralCodesTable).where(eq(referralCodesTable.code, code)).limit(1);
  if (!row) return { ok: false, error: "This referral code is not valid" };

  // Block using your own code: compare with the owner's login emails
  const emails: string[] = [];
  const [admin] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, row.adminId));
  if (admin?.email) emails.push(admin.email.toLowerCase());
  if (row.employeeId) {
    const [emp] = await db.select({ email: employeesTable.email }).from(employeesTable).where(eq(employeesTable.id, row.employeeId));
    if (emp?.email) emails.push(emp.email.toLowerCase());
  }
  if (emails.includes(newEmail.trim().toLowerCase())) {
    return { ok: false, error: "You cannot use your own referral code" };
  }

  return { ok: true, code, referrerAdminId: row.adminId, referrerEmployeeId: row.employeeId };
}

/** Called right after a new company is created with a valid code. */
export async function applyReferralOnSignup(ref: ValidReferral, newAdminId: number, companyName: string): Promise<void> {
  await db
    .insert(referralsTable)
    .values({
      code: ref.code,
      referrerAdminId: ref.referrerAdminId,
      referrerEmployeeId: ref.referrerEmployeeId,
      referredAdminId: newAdminId,
      referredCompanyName: companyName,
    })
    .onConflictDoNothing();
}

export type GrantedReward = {
  referrerAdminId: number;
  referrerEmployeeId: number | null;
  amountPaise: number;
  companyName: string;
};

/**
 * Called INSIDE the billing checkout transaction after a successful payment.
 * Pays the reward once, to the company that referred this one, if the purchase is big enough.
 */
export async function grantReferralReward(
  tx: any,
  opts: { referredAdminId: number; subtotalPaise: number },
): Promise<GrantedReward | null> {
  if (opts.subtotalPaise < REFERRAL_RULES.minPurchasePaise) return null;

  const [ref] = await tx
    .select()
    .from(referralsTable)
    .where(and(eq(referralsTable.referredAdminId, opts.referredAdminId), eq(referralsTable.status, "joined")))
    .limit(1);
  if (!ref) return null;

  const [{ n }] = await tx
    .select({ n: count() })
    .from(referralsTable)
    .where(and(eq(referralsTable.referrerAdminId, ref.referrerAdminId), eq(referralsTable.status, "rewarded")));
  if (Number(n) >= REFERRAL_RULES.maxRewardsPerCompany) {
    await tx.update(referralsTable).set({ status: "capped" }).where(eq(referralsTable.id, ref.id));
    return null;
  }

  // Only one request can win this update, so the reward is never paid twice
  const claimed = await tx
    .update(referralsTable)
    .set({ status: "rewarded", rewardPaise: REFERRAL_RULES.rewardPaise, rewardedAt: new Date() })
    .where(and(eq(referralsTable.id, ref.id), eq(referralsTable.status, "joined")))
    .returning({ id: referralsTable.id });
  if (claimed.length === 0) return null;

  await tx.insert(walletTransactionsTable).values({
    adminId: ref.referrerAdminId,
    type: "credit",
    amountPaise: REFERRAL_RULES.rewardPaise,
    description: `Referral reward: ${ref.referredCompanyName}`,
    reference: `REF-${ref.id}`,
  });

  return {
    referrerAdminId: ref.referrerAdminId,
    referrerEmployeeId: ref.referrerEmployeeId ?? null,
    amountPaise: REFERRAL_RULES.rewardPaise,
    companyName: ref.referredCompanyName,
  };
}