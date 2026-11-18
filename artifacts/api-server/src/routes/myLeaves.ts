import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { getLeaveOptions } from "../lib/leaveRules";

const router = Router();

// The employee's own leave types with balances (used by the Request Leave screens)
router.get("/leaves/my-summary", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "employee") {
    res.status(403).json({ error: "This is only for employee logins" });
    return;
  }

  const year = Number(req.query.year) || new Date().getFullYear();
  const options = await getLeaveOptions(Number(user.adminId), Number(user.employeeId), year);
  res.json({ year, options });
});

export default router;