import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { checkOwnBody, decide, normalizeAccessRole, shapeBody } from "./accessPolicy";

export const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "staffflow-dev-secret-2024";

export interface JwtPayload {
  userId?: number;
  employeeId?: number;
  email: string;
  role: string;
  adminId: number;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  // Support both admin and employee tokens
  if (!payload.adminId) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  // Chartered accountants are view-only: block anything that changes data
  const readOnly = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (payload.role === "ca" && !readOnly && !req.originalUrl.startsWith("/api/push/")) {
    res.status(403).json({ error: "This account is view-only" });
    return;
  }

  (req as any).user = payload;

  // ── Employee logins: check the account still exists, then apply their access level ──
  if (payload.role === "employee") {
    const ownId = Number(payload.employeeId);
    if (!ownId) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    db.select({
      id: employeesTable.id,
      adminId: employeesTable.adminId,
      accessRole: employeesTable.accessRole,
    })
      .from(employeesTable)
      .where(eq(employeesTable.id, ownId))
      .limit(1)
      .then((rows) => {
        const emp = rows[0];
        if (!emp || emp.adminId !== payload.adminId) {
          res.status(401).json({ error: "This account no longer exists" });
          return;
        }

        const accessRole = normalizeAccessRole(emp.accessRole);
        (req as any).user = { ...payload, accessRole };

        const decision = decide(accessRole, req.method, req.originalUrl);
        if (!decision.allow) {
          res.status(403).json({ error: "You don't have access to this" });
          return;
        }

        const bodyError = checkOwnBody(decision, ownId, req.body);
        if (bodyError) {
          res.status(403).json({ error: bodyError });
          return;
        }

        // Only let this employee's own rows (and no salary / face data) leave the server
        const originalJson = res.json.bind(res);
        (res as any).json = (body: unknown) => originalJson(shapeBody(decision, ownId, body));

        next();
      })
      .catch(() => res.status(500).json({ error: "Authentication check failed" }));
    return;
  }

  // ── Co-admins / accountants (userId differs from the owner's id): confirm the account
  //    still exists, so removing someone locks them out immediately. ──
  if (payload.userId && payload.userId !== payload.adminId) {
    db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1)
      .then((rows) => {
        if (rows.length === 0) {
          res.status(401).json({ error: "This account was removed" });
        } else {
          next();
        }
      })
      .catch(() => res.status(500).json({ error: "Authentication check failed" }));
    return;
  }

  next();
}