// What each kind of employee login may do on the server.
// Admin tokens (owner / co-admin) are not affected by any of this.

export type AccessRole = "employee" | "attendance_manager" | "branch_admin";

export type Decision =
  | { allow: false }
  | {
      allow: true;
      /** Only return rows whose employeeId is the caller's own */
      ownRowsOnly?: boolean;
      /** Request body must be about the caller only */
      ownBody?: "records" | "employeeId";
      /** Remove salary fields from returned staff rows */
      stripSalary?: boolean;
      /** Remove face data / password hash from returned staff rows */
      stripBiometrics?: boolean;
    };

export function normalizeAccessRole(value: unknown): AccessRole {
  return value === "attendance_manager" || value === "branch_admin" ? value : "employee";
}

export function decide(accessRole: AccessRole, method: string, rawPath: string): Decision {
  const path = rawPath.split("?")[0].replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const m = method.toUpperCase();
  const manager = accessRole === "attendance_manager" || accessRole === "branch_admin";
  const branch = accessRole === "branch_admin";

  // ── Every employee login ──────────────────────────────────────────────
  if (m === "GET" && path === "/auth/employee-me") return { allow: true };
  if (m === "POST" && (path === "/push/register" || path === "/push/unregister")) return { allow: true };

  // Company holiday list + custom leave names (read-only)
  if (m === "GET" && (path === "/attendance-settings/holidays" || path === "/attendance-settings/leave-types")) return { allow: true };

  // Auto-Live Track: every employee phone may read the setting and send its own location
  if (m === "GET" && path === "/live-track/config") return { allow: true };
  if (m === "POST" && path === "/live-track/ping") return { allow: true };

  // My Documents: every employee login can manage their own documents.
  // (routes/documents.ts makes sure an employee can only ever touch their own.)
  if (m === "GET" && (path === "/documents" || path === "/documents/types")) return { allow: true };
  if (m === "POST" && path === "/documents") return { allow: true };
  if (m === "DELETE" && /^\/documents\/\d+$/.test(path)) return { allow: true };
  if (m === "POST" && /^\/documents\/\d+\/link$/.test(path)) return { allow: true };

  // Refer a Friend: every employee login can see their own code and referrals
  if (m === "GET" && path === "/referrals/me") return { allow: true };

  // Their own tasks and leaves
  if (m === "GET" && (path === "/tasks" || path === "/leaves")) return { allow: true, ownRowsOnly: true };
  if (m === "GET" && path === "/leaves/my-summary") return { allow: true };
  if (m === "POST" && path === "/leaves") return { allow: true, ownBody: "employeeId" };

  // ── Attendance ────────────────────────────────────────────────────────
  if (m === "GET" && path === "/attendance") {
    return manager ? { allow: true } : { allow: true, ownRowsOnly: true };
  }
  if (m === "POST" && path === "/attendance") {
    return manager ? { allow: true } : { allow: true, ownBody: "records" };
  }
  if (m === "POST" && path === "/verify-attendance") {
    return manager ? { allow: true } : { allow: true, ownBody: "employeeId" };
  }
  if (manager && m === "GET" && (path === "/attendance/summary" || path === "/attendance/today-status")) {
    return { allow: true };
  }

  // ── Staff list: managers only. Salary only for branch admins. Face data never. ──
  if (manager && m === "GET" && path === "/employees") {
    return { allow: true, stripSalary: !branch, stripBiometrics: true };
  }

  // ── Salary & payments: branch admins only (deleting stays admin-only) ─────
  if (branch) {
    if (m === "GET" && (path === "/payments" || path === "/payments/salary-summary")) return { allow: true };
    if (m === "POST" && path === "/payments") return { allow: true };
    if (m === "PATCH" && /^\/payments\/\d+$/.test(path)) return { allow: true };
  }

  // Everything else is for admins only
  return { allow: false };
}

/** Returns an error message when the request body is about someone else, otherwise null. */
export function checkOwnBody(d: Decision, ownId: number, body: any): string | null {
  if (!d.allow || !d.ownBody) return null;
  if (d.ownBody === "records") {
    const records = body?.records;
    if (!Array.isArray(records) || records.some((r: any) => Number(r?.employeeId) !== ownId)) {
      return "You can only mark your own attendance";
    }
  }
  if (d.ownBody === "employeeId" && Number(body?.employeeId) !== ownId) {
    return "You can only do this for yourself";
  }
  return null;
}

/** Filters / cleans a JSON response body according to the decision. */
export function shapeBody(d: Decision, ownId: number, body: unknown): unknown {
  if (!d.allow || !Array.isArray(body)) return body;
  let rows: any[] = body;

  if (d.ownRowsOnly) rows = rows.filter((r) => r && Number(r.employeeId) === ownId);

  if (d.stripSalary || d.stripBiometrics) {
    rows = rows.map((r) => {
      if (!r || typeof r !== "object") return r;
      const copy = { ...r };
      if (d.stripBiometrics) {
        delete copy.faceDescriptor;
        delete copy.passwordHash;
      }
      if (d.stripSalary) {
        delete copy.salary;
        delete copy.salaryType;
      }
      return copy;
    });
  }
  return rows;
}