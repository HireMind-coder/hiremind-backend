import { Router } from "express";
import { db, pushTokensTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

// Save this phone's push token for the logged-in admin or employee.
router.post("/push/register", requireAuth, async (req, res): Promise<void> => {
  const { adminId, role, employeeId } = (req as any).user;
  const token = String(req.body?.token ?? "");

  if (!EXPO_TOKEN_RE.test(token)) {
    res.status(400).json({ error: "Invalid push token" });
    return;
  }

  const isEmployee = role === "employee";
  if (isEmployee && !employeeId) {
    res.status(400).json({ error: "Employee id missing in token" });
    return;
  }

  const owner = {
    userType: isEmployee ? "employee" : "admin",
    adminId,
    employeeId: isEmployee ? employeeId : null,
  };

  // A phone can switch accounts, so re-point an existing token to the new owner.
  await db
    .insert(pushTokensTable)
    .values({ token, ...owner })
    .onConflictDoUpdate({
      target: pushTokensTable.token,
      set: { ...owner, updatedAt: new Date() },
    });

  res.json({ success: true });
});

// Remove this phone's token (logout or notifications switched off).
router.post("/push/unregister", requireAuth, async (req, res): Promise<void> => {
  const { adminId } = (req as any).user;
  const token = String(req.body?.token ?? "");

  await db
    .delete(pushTokensTable)
    .where(and(eq(pushTokensTable.token, token), eq(pushTokensTable.adminId, adminId)));

  res.json({ success: true });
});

export default router;