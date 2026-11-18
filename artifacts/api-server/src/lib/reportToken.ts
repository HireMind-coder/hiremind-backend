import jwt from "jsonwebtoken";

// A separate secret + a `purpose` claim, so a download link can never be used as a login token
// (and a login token can never be used as a download link).
const secret = () =>
  (process.env.JWT_SECRET || process.env.SESSION_SECRET || "staffflow-dev-secret-2024") + ":report-download";

export interface ReportTokenPayload {
  purpose: "report";
  aid: number; // company (admin) id
  key: string; // which report
  params: any; // the options chosen on the form
}

export function signReportToken(p: { aid: number; key: string; params: unknown }, expiresIn: string | number = "10m"): string {
  return jwt.sign({ purpose: "report", ...p }, secret(), { expiresIn: expiresIn as any });
}

export function verifyReportToken(token: string): ReportTokenPayload | null {
  try {
    const payload = jwt.verify(token, secret()) as Partial<ReportTokenPayload>;
    if (payload.purpose !== "report" || !payload.aid || !payload.key) return null;
    return payload as ReportTokenPayload;
  } catch {
    return null;
  }
}