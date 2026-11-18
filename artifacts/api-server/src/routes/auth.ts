import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireAuth } from "../lib/auth";
import { LoginBody, RegisterBody } from "@workspace/api-zod";
import { applyReferralOnSignup, validateReferralCode, type ReferralCheck } from "../lib/referrals";
import { logger } from "../lib/logger";

const router = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email, password, companyName } = parsed.data;


  // Optional referral code ("who sent you?"). A wrong code is reported so it can be fixed,
  // instead of silently losing the reward for the person who referred.
  const rawReferral = typeof req.body?.referralCode === "string" ? req.body.referralCode.trim() : "";
  let referral: ReferralCheck | null = null;
  if (rawReferral) {
    referral = await validateReferralCode(rawReferral, email);
    if (!referral.ok) {
      res.status(400).json({ error: referral.error });
      return;
    }
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    name,
    email,
    passwordHash,
    role: "admin",
    companyName,
  }).returning();

  if (referral && referral.ok) {
    try {
      await applyReferralOnSignup(referral, user.id, companyName);
    } catch (err) {
      // Never block sign-up because the referral could not be saved
      logger.error({ err }, "Could not save referral");
    }
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role, adminId: user.id });
  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    adminId: user.ownerId ?? user.id, // co-admins & accountants work inside the owner's company
  });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { userId } = (req as any).user;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyName: user.companyName,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;