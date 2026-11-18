import { randomBytes } from "node:crypto";
import { Router } from "express";
import { db, employeesTable, attendanceTable, leavesTable, paymentsTable, usersTable } from "@workspace/db";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import {
  REPORT_META, buildReport, monthRange, parseReportParams, reportFilename, toCsv,
  type ReportKey, type ReportParams,
} from "../lib/reportBuilders";
import {
  PAYROLL_REPORT_META, buildPayrollReport, isPayrollKey, parsePayrollParams, payrollFilename,
  type PayrollParams, type PayrollReportKey,
} from "../lib/payrollReports";
import { getPayrollConfig } from "../lib/payrollConfig";
import { signReportToken, verifyReportToken } from "../lib/reportToken";

const router = Router();

// Payment dates in reports use this timezone. Change with APP_TIMEZONE in .env.
const TIME_ZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

const ATTENDANCE_REPORTS: ReportKey[] = [
  "attendance_summary", "attendance_detailed", "attendance_daily", "late_arrival", "overtime_report", "salary_sheet",
];

async function loadData(adminId: number, key: ReportKey, params: ReportParams) {
  let employees = await db.select().from(employeesTable).where(eq(employeesTable.adminId, adminId));
  if (params.department) employees = employees.filter((e) => (e.department ?? "") === params.department);

  const data = { employees, attendance: [] as any[], leaves: [] as any[], payments: [] as any[], timeZone: TIME_ZONE };
  const ids = employees.map((e) => e.id);
  if (ids.length === 0) return data;

  const needs = REPORT_META[key].needs;
  const range =
    needs === "month" ? monthRange(params.year!, params.month!)
    : needs === "date" ? { start: params.date!, end: params.date! }
    : null;

  if (range && ATTENDANCE_REPORTS.includes(key)) {
    data.attendance = await db.select().from(attendanceTable).where(
      and(inArray(attendanceTable.employeeId, ids), gte(attendanceTable.date, range.start), lte(attendanceTable.date, range.end)),
    );
  }
  if (range && key === "leave_report") {
    data.leaves = await db.select().from(leavesTable).where(
      and(inArray(leavesTable.employeeId, ids), lte(leavesTable.startDate, range.end), gte(leavesTable.endDate, range.start)),
    );
  }
  if (key === "salary_sheet" || key === "payments_report") {
    data.payments = await db.select().from(paymentsTable).where(inArray(paymentsTable.employeeId, ids));
  }
  return data;
}

const PAYROLL_NEEDS_ATTENDANCE: PayrollReportKey[] = ["pay_slips", "salary_sheet_ctc", "pf_challan", "esi_report", "esi_challan"];

async function loadPayrollData(adminId: number, key: PayrollReportKey, params: PayrollParams) {
  let employees = await db.select().from(employeesTable).where(eq(employeesTable.adminId, adminId));
  if (params.department) employees = employees.filter((e) => (e.department ?? "") === params.department);

  const [owner] = await db
    .select({ companyName: usersTable.companyName })
    .from(usersTable)
    .where(eq(usersTable.id, adminId))
    .limit(1);

  const data = {
    company: owner?.companyName ?? "Company",
    employees,
    attendance: [] as any[],
    payments: [] as any[],
    timeZone: TIME_ZONE,
  };
  const ids = employees.map((e) => e.id);
  if (ids.length === 0) return data;

  if (PAYROLL_NEEDS_ATTENDANCE.includes(key)) {
    const range = monthRange(params.year, params.month);
    data.attendance = await db.select().from(attendanceTable).where(
      and(inArray(attendanceTable.employeeId, ids), gte(attendanceTable.date, range.start), lte(attendanceTable.date, range.end)),
    );
  }
  if (key !== "ctc_breakdown") {
    data.payments = await db.select().from(paymentsTable).where(inArray(paymentsTable.employeeId, ids));
  }
  return data;
}

// Step 1 (logged in): ask for a download link. Returns a short-lived path the phone opens.
// GET /api/report-files/link?report=salary_sheet&month=10&year=2026&department=Sales
router.get("/report-files/link", requireAuth, async (req, res): Promise<void> => {
  const me = (req as any).user;
  if (me.role === "employee") {
    res.status(403).json({ error: "Admins only" });
    return;
  }

  // Payroll reports (pay slips, PF, ESI, CTC, loans ...)
  if (isPayrollKey(String(req.query.report ?? ""))) {
    const parsed = parsePayrollParams(req.query);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const token = signReportToken({ aid: me.adminId, key: parsed.key, params: parsed.params }, "10m");
    res.json({
      path: `/api/report-files/download?t=${encodeURIComponent(token)}`,
      filename: payrollFilename(parsed.key, parsed.params),
      title: PAYROLL_REPORT_META[parsed.key].title,
      format: PAYROLL_REPORT_META[parsed.key].format,
      expiresInSeconds: 600,
    });
    return;
  }

  // Attendance, leave, salary sheet, payments, employee list
  const parsed = parseReportParams(req.query);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const token = signReportToken({ aid: me.adminId, key: parsed.key, params: parsed.params }, "10m");
  res.json({
    path: `/api/report-files/download?t=${encodeURIComponent(token)}`,
    filename: reportFilename(parsed.key, parsed.params),
    title: REPORT_META[parsed.key].title,
    format: "csv",
    expiresInSeconds: 600,
  });
});

// Step 2 (opened by the phone's browser, so no login header): the link itself proves access.
router.get("/report-files/download", async (req, res): Promise<void> => {
  const payload = verifyReportToken(String(req.query.t ?? ""));
  if (!payload) {
    res.status(401).type("text/plain").send("This download link has expired. Please generate the report again.");
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (isPayrollKey(payload.key)) {
    const params = payload.params as PayrollParams;
    const data = await loadPayrollData(payload.aid, payload.key, params);
    const nonce = randomBytes(16).toString("base64");
    const result = buildPayrollReport(payload.key, params, data, getPayrollConfig(), nonce);

    if (result.kind === "html") {
      // Pay slips open as a page in the browser; "Print / Save as PDF" does the rest.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
      res.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`);
      res.send(result.html);
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(toCsv(result.rows));
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(REPORT_META, payload.key)) {
    res.status(400).type("text/plain").send("Unknown report.");
    return;
  }

  const key = payload.key as ReportKey;
  const params = payload.params as ReportParams;
  const data = await loadData(payload.aid, key, params);
  const { filename, rows } = buildReport(key, params, data);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
});

export default router;