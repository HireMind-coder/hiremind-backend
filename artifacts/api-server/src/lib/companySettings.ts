import { db, pool, companyProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Tables are created at server start (Railway deploy has no `drizzle push` step)
export async function ensureCompanyTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_profiles (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      company_code text NOT NULL,
      business_type text,
      address text,
      gst_number text,
      udyam_number text,
      logo_url text,
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT company_profiles_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT company_profiles_admin_id_unique UNIQUE (admin_id),
      CONSTRAINT company_profiles_company_code_unique UNIQUE (company_code)
    );

    CREATE TABLE IF NOT EXISTS branches (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      name text NOT NULL,
      address text,
      latitude double precision,
      longitude double precision,
      radius integer NOT NULL DEFAULT 100,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT branches_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS departments (
      id serial PRIMARY KEY,
      admin_id integer NOT NULL,
      name text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT departments_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT departments_admin_name_unique UNIQUE (admin_id, name)
    );
    -- Branch address: city, state, pincode
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS city text;
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS state text;
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS pincode text;
  `);
  logger.info("Company settings tables ready");
}

// No 0/O/1/I so the code is easy to read out loud
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

/** Returns the company profile, creating it (with a fresh company code) the first time. */
export async function getOrCreateCompanyProfile(adminId: number) {
  const find = async () =>
    (await db.select().from(companyProfilesTable).where(eq(companyProfilesTable.adminId, adminId)).limit(1))[0];

  const existing = await find();
  if (existing) return existing;

  for (let i = 0; i < 8; i++) {
    // onConflictDoNothing covers both "profile already created" and "code already taken"
    await db.insert(companyProfilesTable).values({ adminId, companyCode: makeCode() }).onConflictDoNothing();
    const row = await find();
    if (row) return row;
  }
  throw new Error("Could not create company profile");
}