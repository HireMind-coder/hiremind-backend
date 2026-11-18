import { Router } from "express";
import { db, employeesTable, referralsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { REFERRAL_RULES, getOrCreateReferralCode } from "../lib/referrals";

const router = Router();

/**
 * Everything the Refer a Friend screen needs.
 * - An employee sees their own code and only the companies THEY referred.
 * - An admin sees the company's admin code and every referral made by the company
 *   (employees' included), with who made it.
 */
router.get("/referrals/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const adminId = Number(user.adminId);
  const isEmployee = user.role === "employee";
  const employeeId = isEmployee ? Number(user.employeeId) : null;

  const codeRow = await getOrCreateReferralCode(adminId, employeeId);

  const rows = await db
    .select({
      id: referralsTable.id,
      companyName: referralsTable.referredCompanyName,
      status: referralsTable.status,
      rewardPaise: referralsTable.rewardPaise,
      createdAt: referralsTable.createdAt,
      referrerEmployeeId: referralsTable.referrerEmployeeId,
      referrerName: employeesTable.name,
    })
    .from(referralsTable)
    .leftJoin(employeesTable, eq(referralsTable.referrerEmployeeId, employeesTable.id))
    .where(
      isEmployee
        ? and(eq(referralsTable.referrerAdminId, adminId), eq(referralsTable.referrerEmployeeId, employeeId!))
        : eq(referralsTable.referrerAdminId, adminId),
    )
    .orderBy(desc(referralsTable.createdAt))
    .limit(200);

  res.json({
    code: codeRow.code,
    rules: {
      rewardPaise: REFERRAL_RULES.rewardPaise,
      minPurchasePaise: REFERRAL_RULES.minPurchasePaise,
    },
    stats: {
      joined: rows.length,
      rewarded: rows.filter((r) => r.status === "rewarded").length,
      earnedPaise: rows.reduce((sum, r) => sum + (r.status === "rewarded" ? r.rewardPaise : 0), 0),
    },
    referrals: rows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      status: r.status,
      rewardPaise: r.rewardPaise,
      createdAt: r.createdAt.toISOString(),
      // Only the admin view needs to know which employee made the referral
      referredBy: isEmployee ? null : r.referrerEmployeeId ? r.referrerName ?? "An employee" : "Admin",
    })),
  });
});

export default router;