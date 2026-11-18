import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, employeesTable } from "@workspace/db";
import { and, eq, or, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const ACCESS_ROLES = ["employee", "attendance_manager", "branch_admin"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TokenUser = { userId?: number; adminId: number; role: string };

// Admin-level = the owner or a co-admin (not employees, not accountants)
const isAdminLevel = (u: TokenUser) => u.role === "admin" && !!u.userId;
// Owner = the account that created the company
const isOwner = (u: TokenUser) => isAdminLevel(u) && u.userId === u.adminId;

// List admins (?kind=admin) or chartered accountants (?kind=ca)
router.get("/team/members", requireAuth, async (req, res): Promise<void> => {
  const me = (req as any).user as TokenUser;
  if (!isAdminLevel(me)) {
    res.status(403).json({ error: "Admins only" });
    return;
  }

  const kind = req.query.kind === "ca" ? "ca" : "admin";
  const rows = await db
    .select()
    .from(usersTable)
    .where(
      and(
        or(eq(usersTable.id, me.adminId), eq(usersTable.ownerId, me.adminId)),
        eq(usersTable.role, kind),
      ),
    );

  // owner first, then oldest first
  rows.sort((a, b) => (a.id === me.adminId ? -1 : b.id === me.adminId ? 1 : a.id - b.id));

  res.json({
    canManage: isOwner(me),
    members: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      isOwner: u.id === me.adminId,
    })),
  });
});

// Add an admin or chartered accountant (owner only)
router.post("/team/members", requireAuth, async (req, res): Promise<void> => {
  const me = (req as any).user as TokenUser;
  if (!isOwner(me)) {
    res.status(403).json({ error: "Only the company owner can add admins or accountants" });
    return;
  }

  const kind = req.body?.kind === "ca" ? "ca" : "admin";
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  const phone = String(req.body?.phone ?? "").replace(/[^\d+]/g, "");
  const password = String(req.body?.password ?? "");

  if (name.length < 2) {
    res.status(400).json({ error: "Enter a name" });
    return;
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }
  if (phone.replace(/\D/g, "").length < 7) {
    res.status(400).json({ error: "Enter a valid phone number" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(sql`lower(${usersTable.email})`, email.toLowerCase()))
    .limit(1);
  if (existing) {
    res.status(400).json({ error: "This email is already registered" });
    return;
  }

  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, me.adminId)).limit(1);
  if (!owner) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      name,
      email,
      phone,
      passwordHash: await bcrypt.hash(password, 10),
      role: kind === "ca" ? "ca" : "admin",
      companyName: owner.companyName,
      ownerId: owner.id,
    })
    .returning();

  res.status(201).json({
    id: created.id,
    name: created.name,
    email: created.email,
    phone: created.phone,
    role: created.role,
    isOwner: false,
  });
});

// Remove an admin or chartered accountant (owner only)
router.delete("/team/members/:id", requireAuth, async (req, res): Promise<void> => {
  const me = (req as any).user as TokenUser;
  if (!isOwner(me)) {
    res.status(403).json({ error: "Only the company owner can remove admins or accountants" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id === me.adminId) {
    res.status(400).json({ error: "The company owner cannot be removed" });
    return;
  }

  const deleted = await db
    .delete(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.ownerId, me.adminId)))
    .returning({ id: usersTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json({ success: true });
});

// Change an employee's access level (admins only)
router.patch("/team/employees/:id/access-role", requireAuth, async (req, res): Promise<void> => {
  const me = (req as any).user as TokenUser;
  if (!isAdminLevel(me)) {
    res.status(403).json({ error: "Admins only" });
    return;
  }

  const id = Number(req.params.id);
  const accessRole = String(req.body?.accessRole ?? "");
  if (!Number.isInteger(id) || !(ACCESS_ROLES as readonly string[]).includes(accessRole)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  const [updated] = await db
    .update(employeesTable)
    .set({ accessRole })
    .where(and(eq(employeesTable.id, id), eq(employeesTable.adminId, me.adminId)))
    .returning({ id: employeesTable.id, accessRole: employeesTable.accessRole });

  if (!updated) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json(updated);
});

// Who am I? (employee logins only) - the app uses this to know its access level
router.get("/auth/employee-me", requireAuth, async (req, res): Promise<void> => {
  const me = (req as any).user;
  if (me.role !== "employee") {
    res.status(403).json({ error: "Employee accounts only" });
    return;
  }
  res.json({ id: me.employeeId, accessRole: me.accessRole ?? "employee" });
});

export default router;