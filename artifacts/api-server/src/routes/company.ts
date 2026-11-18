import { Router } from "express";
import path from "path";
import { mkdirSync, writeFileSync } from "fs";
import {
  db,
  usersTable,
  companyProfilesTable,
  branchesTable,
  departmentsTable,
  employeesTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getOrCreateCompanyProfile } from "../lib/companySettings";
import { STATE_NAMES } from "../lib/billingCatalog";

const router = Router();

const BUSINESS_TYPES = [
  "IT Software", "Retail", "Manufacturing", "Services", "Healthcare", "Education",
  "Construction", "Finance", "Hospitality", "Logistics", "Other",
];

const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const UDYAM_RE = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;

const LOGO_DIR = path.join(process.cwd(), "uploads", "company");

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// ─── Company details ────────────────────────────────────────────────────────

async function loadCompany(adminId: number) {
  const profile = await getOrCreateCompanyProfile(adminId);
  const [owner] = await db.select({ companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, adminId));
  return {
    companyName: owner?.companyName ?? "",
    businessType: profile.businessType ?? "",
    address: profile.address ?? "",
    gstNumber: profile.gstNumber ?? "",
    udyamNumber: profile.udyamNumber ?? "",
    logoUrl: profile.logoUrl ?? null,
    companyCode: profile.companyCode,
    businessTypes: BUSINESS_TYPES,
  };
}

router.get("/company", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  res.json(await loadCompany(adminId));
});

router.put("/company", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const b = req.body ?? {};

  const companyName = clean(b.companyName, 120);
  if (!companyName) { res.status(400).json({ error: "Company name is required" }); return; }

  const gst = clean(b.gstNumber, 15).toUpperCase();
  if (gst && !GST_RE.test(gst)) {
    res.status(400).json({ error: "Enter a valid 15-character GST number (e.g. 07AAMCA0717H1ZU)" });
    return;
  }

  const udyam = clean(b.udyamNumber, 25).toUpperCase();
  if (udyam && !UDYAM_RE.test(udyam)) {
    res.status(400).json({ error: "Udyam number must look like UDYAM-XX-00-0000000" });
    return;
  }

  await getOrCreateCompanyProfile(adminId);
  await db.update(usersTable).set({ companyName }).where(eq(usersTable.id, adminId));
  await db
    .update(companyProfilesTable)
    .set({
      businessType: clean(b.businessType, 60) || null,
      address: clean(b.address, 300) || null,
      gstNumber: gst || null,
      udyamNumber: udyam || null,
      updatedAt: new Date(),
    })
    .where(eq(companyProfilesTable.adminId, adminId));

  res.json(await loadCompany(adminId));
});

router.post("/company/logo", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const raw = typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
  const b64 = raw.replace(/^data:image\/\w+;base64,/, "");
  if (!b64) { res.status(400).json({ error: "Image is required" }); return; }

  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0 || buf.length > 3 * 1024 * 1024) {
    res.status(400).json({ error: "Logo must be smaller than 3 MB" });
    return;
  }
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!isPng && !isJpg) { res.status(400).json({ error: "Only PNG or JPG images are allowed" }); return; }

  mkdirSync(LOGO_DIR, { recursive: true });
  const filename = `logo-${adminId}-${Date.now()}.${isPng ? "png" : "jpg"}`;
  writeFileSync(path.join(LOGO_DIR, filename), buf);

  await getOrCreateCompanyProfile(adminId);
  const logoUrl = `/api/uploads/company/${filename}`;
  await db
    .update(companyProfilesTable)
    .set({ logoUrl, updatedAt: new Date() })
    .where(eq(companyProfilesTable.adminId, adminId));

  res.json({ logoUrl });
});

// ─── Branches ───────────────────────────────────────────────────────────────

function parseBranch(body: any) {
  const name = clean(body?.name, 60);
  if (!name) return "Branch name is required";

  const address = clean(body?.address, 200) || null;

  const city = clean(body?.city, 80);
  if (!city) return "City is required";

  const state = clean(body?.state, 80);
  if (!STATE_NAMES.includes(state)) return "Select a valid state";

  const pincode = clean(body?.pincode, 6);
  if (!/^\d{6}$/.test(pincode)) return "Pincode must be 6 digits";

  const hasLat = body?.latitude !== undefined && body?.latitude !== null && body?.latitude !== "";
  const hasLng = body?.longitude !== undefined && body?.longitude !== null && body?.longitude !== "";
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (hasLat || hasLng) {
    latitude = Number(body.latitude);
    longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return "Enter a valid latitude and longitude";
    }
  }

  const radius = body?.radius === undefined || body?.radius === "" ? 100 : Math.round(Number(body.radius));
  if (!Number.isFinite(radius) || radius < 20 || radius > 5000) return "Radius must be between 20 and 5000 metres";

  return { name, address, city, state, pincode, latitude, longitude, radius };
}

router.get("/company/branches", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const rows = await db.select().from(branchesTable).where(eq(branchesTable.adminId, adminId)).orderBy(asc(branchesTable.id));
  res.json(rows);
});

router.post("/company/branches", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const parsed = parseBranch(req.body);
  if (typeof parsed === "string") { res.status(400).json({ error: parsed }); return; }
  const [row] = await db.insert(branchesTable).values({ adminId, ...parsed }).returning();
  res.status(201).json(row);
});

router.patch("/company/branches/:id", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const parsed = parseBranch(req.body);
  if (typeof parsed === "string") { res.status(400).json({ error: parsed }); return; }
  const [row] = await db
    .update(branchesTable)
    .set(parsed)
    .where(and(eq(branchesTable.id, id), eq(branchesTable.adminId, adminId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(row);
});

router.delete("/company/branches/:id", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const deleted = await db
    .delete(branchesTable)
    .where(and(eq(branchesTable.id, id), eq(branchesTable.adminId, adminId)))
    .returning({ id: branchesTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Branch not found" }); return; }
  res.status(204).send();
});

// ─── Departments ────────────────────────────────────────────────────────────

router.get("/company/departments", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const rows = await db.select().from(departmentsTable).where(eq(departmentsTable.adminId, adminId)).orderBy(asc(departmentsTable.name));
  res.json(rows);
});

router.post("/company/departments", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const name = clean(req.body?.name, 60);
  if (!name) { res.status(400).json({ error: "Department name is required" }); return; }

  const existing = await db.select().from(departmentsTable).where(eq(departmentsTable.adminId, adminId));
  if (existing.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
    res.status(409).json({ error: "This department already exists" });
    return;
  }
  const [row] = await db.insert(departmentsTable).values({ adminId, name }).returning();
  res.status(201).json(row);
});

router.patch("/company/departments/:id", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const name = clean(req.body?.name, 60);
  if (!name) { res.status(400).json({ error: "Department name is required" }); return; }

  const all = await db.select().from(departmentsTable).where(eq(departmentsTable.adminId, adminId));
  const current = all.find((d) => d.id === id);
  if (!current) { res.status(404).json({ error: "Department not found" }); return; }
  if (all.some((d) => d.id !== id && d.name.toLowerCase() === name.toLowerCase())) {
    res.status(409).json({ error: "This department already exists" });
    return;
  }

  const [row] = await db
    .update(departmentsTable)
    .set({ name })
    .where(and(eq(departmentsTable.id, id), eq(departmentsTable.adminId, adminId)))
    .returning();

  // Keep employees pointing at the renamed department
  if (current.name !== name) {
    await db
      .update(employeesTable)
      .set({ department: name })
      .where(and(eq(employeesTable.adminId, adminId), eq(employeesTable.department, current.name)));
  }
  res.json(row);
});

router.delete("/company/departments/:id", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = Number(req.params.id);
  const deleted = await db
    .delete(departmentsTable)
    .where(and(eq(departmentsTable.id, id), eq(departmentsTable.adminId, adminId)))
    .returning({ id: departmentsTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Department not found" }); return; }
  res.status(204).send();
});

export default router;