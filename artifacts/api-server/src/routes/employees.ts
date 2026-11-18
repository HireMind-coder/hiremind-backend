import { Router } from "express";
import { db, employeesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { checkStaffLimit } from "../lib/billing";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  CreateEmployeeBody,
  UpdateEmployeeBody,
  GetEmployeeParams,
  UpdateEmployeeParams,
  DeleteEmployeeParams,
  ListEmployeesQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/employees", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const queryParams = ListEmployeesQueryParams.safeParse(req.query);
  const search = queryParams.success ? queryParams.data.search : undefined;
  const role = queryParams.success ? queryParams.data.role : undefined;

  let employees = await db.select().from(employeesTable).where(eq(employeesTable.adminId, adminId));

  if (search) {
    employees = employees.filter(e =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.phone.includes(search)
    );
  }
  if (role) {
    employees = employees.filter(e => e.role === role);
  }

  res.json(employees.map(e => ({
    ...e,
    salary: Number(e.salary),
    createdAt: e.createdAt.toISOString(),
    passwordHash: undefined, // never expose password
  })));
});

router.post("/employees", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Plan staff limit (Subscriptions & Billing)
  const limit = await checkStaffLimit(adminId);
  if (!limit.ok) {
    res.status(403).json({ error: limit.error, code: "STAFF_LIMIT_REACHED" });
    return;
  }

  const { password, ...employeeData } = parsed.data as any;

  let passwordHash = null;
  if (password) {
    passwordHash = await bcrypt.hash(password, 10);
  }
 // 👇 ADD THIS LINE HERE
  console.log("Password received:", password);
  console.log("PasswordHash to insert:", passwordHash);

  const [employee] = await db.insert(employeesTable).values({
    ...employeeData,
    adminId,
    salary: String(employeeData.salary),
    passwordHash,
  }).returning();

 console.log("Employee saved in DB:", JSON.stringify(employee));

  res.status(201).json({
    ...employee,
    salary: Number(employee.salary),
    createdAt: employee.createdAt.toISOString(),
    passwordHash: undefined,
  });
});

router.get("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const params = GetEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [employee] = await db.select().from(employeesTable)
    .where(and(eq(employeesTable.id, params.data.id), eq(employeesTable.adminId, adminId)));
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  res.json({
    ...employee,
    salary: Number(employee.salary),
    createdAt: employee.createdAt.toISOString(),
    passwordHash: undefined,
  });
});

router.patch("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { password, ...restData } = parsed.data as any;
  const updateData: any = { ...restData };

  if (updateData.salary !== undefined) {
    updateData.salary = String(updateData.salary);
  }

  // Only admin can change password
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }

  const [employee] = await db.update(employeesTable)
    .set(updateData)
    .where(and(eq(employeesTable.id, params.data.id), eq(employeesTable.adminId, adminId)))
    .returning();

  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  res.json({
    ...employee,
    salary: Number(employee.salary),
    createdAt: employee.createdAt.toISOString(),
    passwordHash: undefined,
  });
});

// Change password — admin only
router.patch("/employees/:id/change-password", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const id = parseInt(req.params.id);
  const { password } = req.body;

  if (!password || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [employee] = await db.update(employeesTable)
    .set({ passwordHash })
    .where(and(eq(employeesTable.id, id), eq(employeesTable.adminId, adminId)))
    .returning();

  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  res.json({ success: true, message: "Password updated successfully" });
});


// Delete ALL staff for the logged-in admin's company. Admin only.
router.delete("/employees", requireAuth, async (req, res): Promise<void> => {
  const { adminId, role, userId } = (req as any).user;
  if (role === "employee" || !userId) {
    res.status(403).json({ error: "Only an admin can delete all staff" });
    return;
  }

  const deleted = await db.delete(employeesTable)
    .where(eq(employeesTable.adminId, adminId))
    .returning({ id: employeesTable.id });

  res.json({ success: true, deletedCount: deleted.length });
});

router.delete("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const params = DeleteEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [employee] = await db.delete(employeesTable)
    .where(and(eq(employeesTable.id, params.data.id), eq(employeesTable.adminId, adminId)))
    .returning();

  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  res.sendStatus(204);
});

// Employee self-login
router.post("/auth/employee-login", async (req, res): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [employee] = await db.select().from(employeesTable)
    .where(eq(employeesTable.email, email));

  if (!employee || !employee.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

console.log("Employee found:", employee.email);
console.log("Password hash exists:", !!employee.passwordHash);
console.log("Hash preview:", employee.passwordHash?.substring(0, 10));
const valid = await bcrypt.compare(password, employee.passwordHash);
console.log("Password valid:", valid);
if (!valid) {
  res.status(401).json({ error: "Invalid credentials" });
  return;
}

  const token = jwt.sign(
    {
      employeeId: employee.id,
      adminId: employee.adminId,
      role: "employee",
      email: employee.email,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "30d" }
  );

  res.json({
    token,
    employee: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      adminId: employee.adminId,
    }
  });
});

// Admin reset employee password
router.post("/auth/reset-employee-password", requireAuth, async (req, res): Promise<void> => {
  const { adminId, role, userId } = (req as any).user;
  if (role !== "admin" || !userId) {
    res.status(403).json({ error: "Only an admin can reset an employee's password" });
    return;
  }

  const { email, newPassword } = req.body;
  if (!email || !newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: "Email and a password of at least 6 characters are required" });
    return;
  }

  const hash = await bcrypt.hash(String(newPassword), 10);
  const [employee] = await db.update(employeesTable)
    .set({ passwordHash: hash })
    .where(and(eq(employeesTable.email, email), eq(employeesTable.adminId, adminId)))
    .returning();
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json({ success: true });
});


export default router;