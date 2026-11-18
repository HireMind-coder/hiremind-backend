// Builds the downloadable company reports (CSV). Pure functions: no database access here.
// Formulas for attendance % and salary match the app's own dashboard / salary screens.

import { localKey, toHHmm } from "./notificationFeed";

export type Cell = string | number | null;

export type ReportKey =
  | "attendance_summary"
  | "attendance_detailed"
  | "attendance_daily"
  | "late_arrival"
  | "leave_report"
  | "overtime_report"
  | "salary_sheet"
  | "payments_report"
  | "employee_list";

export const REPORT_META: Record<ReportKey, { title: string; needs: "month" | "date" | "none" }> = {
  attendance_summary: { title: "Attendance Summary Report", needs: "month" },
  attendance_detailed: { title: "Detailed Attendance Report", needs: "month" },
  attendance_daily: { title: "Daily Attendance Report", needs: "date" },
  late_arrival: { title: "Late Arrival Report", needs: "month" },
  leave_report: { title: "Leave Report", needs: "month" },
  overtime_report: { title: "Overtime Report", needs: "month" },
  salary_sheet: { title: "Salary Sheet", needs: "month" },
  payments_report: { title: "Payments Report", needs: "month" },
  employee_list: { title: "Employee List", needs: "none" },
};

export interface ReportParams {
  month?: number;
  year?: number;
  date?: string; // YYYY-MM-DD
  department?: string | null;
  lateAfter?: string; // HH:mm
}

interface Emp {
  id: number; name: string; phone: string; email: string | null; role: string;
  department: string | null; salary: string | number; salaryType: string;
  joiningDate: string; status: string; accessRole?: string | null;
}
interface Att {
  id: number; employeeId: number; date: string; status: string;
  checkIn: string | null; checkOut: string | null; note: string | null;
  overtimeHours: number | null;
}
interface Leave {
  id: number; employeeId: number; type: string; startDate: string; endDate: string;
  days: number; reason: string | null; status: string; approverNote: string | null;
}
interface Pay {
  id: number; employeeId: number; amount: string | number; type: string; method: string;
  month: number | null; year: number | null; note: string | null; status: string;
  paidAt: Date | null; createdAt: Date;
}

export interface ReportData {
  employees: Emp[];
  attendance: Att[];
  leaves: Leave[];
  payments: Pay[];
  timeZone?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthRange(year: number, month: number) {
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}` };
}

const STATUS_LABEL: Record<string, string> = { present: "Present", half_day: "Half Day", absent: "Absent" };
const statusLabel = (s: string) =>
  STATUS_LABEL[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "");

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// ── CSV ────────────────────────────────────────────────────────────────────

/** Looks like a plain number/phone, e.g. "+919876543210" or "-12.5" -> safe to leave alone. */
const NUMBER_LIKE = /^[+-]?\d[\d\s().,-]*$/;

export function toCsv(rows: Cell[][]): string {
  const esc = (c: Cell): string => {
    if (c === null || c === undefined) return "";
    if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
    let s = String(c);
    // Stop spreadsheet formula injection (a name like "=HYPERLINK(...)" must not execute)
    if (/^[=+\-@\t\r]/.test(s) && !NUMBER_LIKE.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel reads UTF-8 (₹, Hindi names) correctly
  return "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

// ── Params ─────────────────────────────────────────────────────────────────

export function parseReportParams(
  q: Record<string, unknown>,
): { ok: true; key: ReportKey; params: ReportParams } | { ok: false; error: string } {
  const key = String(q.report ?? "");
  if (!Object.prototype.hasOwnProperty.call(REPORT_META, key)) return { ok: false, error: "Unknown report" };
  const meta = REPORT_META[key as ReportKey];
  const params: ReportParams = {};

  const dep = String(q.department ?? "").trim();
  if (dep && dep !== "all") {
    if (dep.length > 100) return { ok: false, error: "Department name is too long" };
    params.department = dep;
  }

  if (meta.needs === "month") {
    const month = Number(q.month);
    const year = Number(q.year);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: "Choose a valid month" };
    }
    params.month = month;
    params.year = year;
  }

  if (meta.needs === "date") {
    const date = String(q.date ?? "");
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const valid =
      !!m &&
      (() => {
        const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        return dt.getUTCFullYear() === Number(m[1]) && dt.getUTCMonth() === Number(m[2]) - 1 && dt.getUTCDate() === Number(m[3]);
      })();
    if (!valid) return { ok: false, error: "Choose a valid date" };
    params.date = date;
  }

  if (key === "late_arrival") {
    const t = toHHmm(String(q.lateAfter ?? "10:00"));
    if (!t) return { ok: false, error: "Enter the late time like 10:00" };
    params.lateAfter = t;
  }

  return { ok: true, key: key as ReportKey, params };
}

export function periodText(key: ReportKey, p: ReportParams): string {
  const needs = REPORT_META[key].needs;
  if (needs === "month") return `${MONTHS[(p.month ?? 1) - 1]}_${p.year}`;
  if (needs === "date") return p.date ?? "";
  return "";
}

export function reportFilename(key: ReportKey, p: ReportParams): string {
  const base = REPORT_META[key].title.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const period = periodText(key, p);
  return `${base}${period ? "_" + period : ""}.csv`;
}

// ── Builders ───────────────────────────────────────────────────────────────

export function buildReport(
  key: ReportKey,
  p: ReportParams,
  d: ReportData,
): { title: string; filename: string; rows: Cell[][] } {
  const emps = [...d.employees].sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(emps.map((e) => [e.id, e]));
  const dept = (e?: Emp) => e?.department ?? "";
  const rows: Cell[][] = [];

  const month = p.month ?? 1;
  const year = p.year ?? new Date().getFullYear();
  const range = monthRange(year, month);
  const inMonth = (date: string) => date >= range.start && date <= range.end;
  const workingDays = daysInMonth(year, month);

  const sortedAtt = (list: Att[]) =>
    list
      .filter((a) => byId.has(a.employeeId))
      .sort((a, b) =>
        a.date === b.date
          ? (byId.get(a.employeeId)!.name).localeCompare(byId.get(b.employeeId)!.name)
          : a.date < b.date ? -1 : 1,
      );

  switch (key) {
    case "attendance_summary": {
      rows.push(["Employee", "Department", "Job Role", "Working Days", "Present", "Half Day", "Absent", "Overtime (hrs)", "Attendance %"]);
      let tp = 0, th = 0, ta = 0, to = 0;
      for (const e of emps) {
        const mine = d.attendance.filter((a) => a.employeeId === e.id && inMonth(a.date));
        const present = mine.filter((a) => a.status === "present").length;
        const half = mine.filter((a) => a.status === "half_day").length;
        const absent = mine.filter((a) => a.status === "absent").length;
        const ot = mine.reduce((s, a) => s + (a.overtimeHours || 0), 0);
        const pct = workingDays > 0 ? Math.round(((present + half * 0.5) / workingDays) * 100) : 0;
        tp += present; th += half; ta += absent; to += ot;
        rows.push([e.name, dept(e), e.role, workingDays, present, half, absent, r2(ot), pct]);
      }
      rows.push(["Total", "", "", "", tp, th, ta, r2(to), ""]);
      break;
    }

    case "attendance_detailed": {
      rows.push(["Date", "Employee", "Department", "Status", "Check In", "Check Out", "Hours Worked", "Overtime (hrs)", "Note"]);
      for (const a of sortedAtt(d.attendance.filter((x) => inMonth(x.date)))) {
        const e = byId.get(a.employeeId);
        const inT = toHHmm(a.checkIn);
        const outT = toHHmm(a.checkOut);
        const worked = inT && outT && minutes(outT) > minutes(inT) ? r2((minutes(outT) - minutes(inT)) / 60) : null;
        rows.push([a.date, e!.name, dept(e), statusLabel(a.status), inT, outT, worked, a.overtimeHours ?? null, a.note ?? ""]);
      }
      break;
    }

    case "attendance_daily": {
      rows.push(["Employee", "Department", "Job Role", "Status", "Check In", "Check Out", "Overtime (hrs)"]);
      for (const e of emps) {
        const a = d.attendance.find((x) => x.employeeId === e.id && x.date === p.date);
        rows.push([e.name, dept(e), e.role, a ? statusLabel(a.status) : "Not Marked", a ? toHHmm(a.checkIn) : null, a ? toHHmm(a.checkOut) : null, a?.overtimeHours ?? null]);
      }
      break;
    }

    case "late_arrival": {
      const lateAfter = p.lateAfter ?? "10:00";
      rows.push(["Date", "Employee", "Department", "Check In", `Late By (min) after ${lateAfter}`]);
      for (const a of sortedAtt(d.attendance.filter((x) => inMonth(x.date) && (x.status === "present" || x.status === "half_day")))) {
        const inT = toHHmm(a.checkIn);
        if (!inT || minutes(inT) <= minutes(lateAfter)) continue;
        const e = byId.get(a.employeeId);
        rows.push([a.date, e!.name, dept(e), inT, minutes(inT) - minutes(lateAfter)]);
      }
      break;
    }

    case "leave_report": {
      rows.push(["Employee", "Department", "Leave Type", "From", "To", "Days", "Status", "Reason", "Approver Note"]);
      const list = d.leaves
        .filter((l) => byId.has(l.employeeId) && l.startDate <= range.end && l.endDate >= range.start)
        .sort((a, b) => (a.startDate === b.startDate ? a.id - b.id : a.startDate < b.startDate ? -1 : 1));
      for (const l of list) {
        const e = byId.get(l.employeeId);
        rows.push([e!.name, dept(e), l.type, l.startDate, l.endDate, l.days, statusLabel(l.status), l.reason ?? "", l.approverNote ?? ""]);
      }
      break;
    }

    case "overtime_report": {
      rows.push(["Date", "Employee", "Department", "Check In", "Check Out", "Overtime (hrs)"]);
      let total = 0;
      for (const a of sortedAtt(d.attendance.filter((x) => inMonth(x.date) && (x.overtimeHours || 0) > 0))) {
        const e = byId.get(a.employeeId);
        total += a.overtimeHours || 0;
        rows.push([a.date, e!.name, dept(e), toHHmm(a.checkIn), toHHmm(a.checkOut), a.overtimeHours]);
      }
      rows.push(["Total", "", "", "", "", r2(total)]);
      break;
    }

    case "salary_sheet": {
      rows.push([
        "Employee", "Department", "Job Role", "Salary Type", "Base Salary", "Working Days", "Present Days",
        "Half Days", "Overtime (hrs)", "Net Salary", "Overtime Pay", "Deductions", "Advances", "Final Salary", "Paid", "Pending",
      ]);
      const monthPays = d.payments.filter((x) => x.month === month && x.year === year);
      const tot = { net: 0, otp: 0, ded: 0, adv: 0, fin: 0, paid: 0, pend: 0 };
      for (const e of emps) {
        const mine = d.attendance.filter((a) => a.employeeId === e.id && inMonth(a.date));
        const present = mine.filter((a) => a.status === "present").length;
        const half = mine.filter((a) => a.status === "half_day").length;
        const ot = mine.reduce((s, a) => s + (a.overtimeHours || 0), 0);
        const base = Number(e.salary);
        const net = e.salaryType === "daily" ? base * (present + half * 0.5) : (base / workingDays) * (present + half * 0.5);
        const otPay = ot * (base / workingDays / 8);
        const pays = monthPays.filter((x) => x.employeeId === e.id);
        const ded = pays.filter((x) => x.type === "deduction").reduce((s, x) => s + Number(x.amount), 0);
        const adv = pays.filter((x) => x.type === "advance").reduce((s, x) => s + Number(x.amount), 0);
        const paid = pays.filter((x) => x.type === "salary" && x.status === "paid").reduce((s, x) => s + Number(x.amount), 0);
        const fin = net + otPay - ded - adv;
        const pend = Math.max(0, fin - paid);
        tot.net += net; tot.otp += otPay; tot.ded += ded; tot.adv += adv; tot.fin += fin; tot.paid += paid; tot.pend += pend;
        rows.push([e.name, dept(e), e.role, e.salaryType, base, workingDays, present, half, r2(ot), r2(net), r2(otPay), r2(ded), r2(adv), r2(fin), r2(paid), r2(pend)]);
      }
      rows.push(["Total", "", "", "", "", "", "", "", "", r2(tot.net), r2(tot.otp), r2(tot.ded), r2(tot.adv), r2(tot.fin), r2(tot.paid), r2(tot.pend)]);
      break;
    }

    case "payments_report": {
      rows.push(["Date", "Employee", "Department", "Type", "Amount", "Method", "Status", "Note"]);
      const monthKey = `${year}-${pad(month)}`;
      const list = d.payments
        .filter((x) => byId.has(x.employeeId))
        .filter((x) =>
          x.month != null && x.year != null
            ? x.month === month && x.year === year
            : localKey(x.paidAt ?? x.createdAt, d.timeZone).startsWith(monthKey),
        )
        .map((x) => ({ x, when: localKey(x.paidAt ?? x.createdAt, d.timeZone).slice(0, 10) }))
        .sort((a, b) => (a.when === b.when ? a.x.id - b.x.id : a.when < b.when ? -1 : 1));
      let paidTotal = 0;
      for (const { x, when } of list) {
        const e = byId.get(x.employeeId);
        if (x.status === "paid") paidTotal += Number(x.amount);
        rows.push([when, e!.name, dept(e), x.type, r2(Number(x.amount)), x.method, statusLabel(x.status), x.note ?? ""]);
      }
      rows.push(["Total paid", "", "", "", r2(paidTotal), "", "", ""]);
      break;
    }

    case "employee_list": {
      rows.push(["Employee", "Phone", "Email", "Job Role", "Department", "Salary", "Salary Type", "Joining Date", "Status", "Access Level"]);
      const access: Record<string, string> = { employee: "Employee", attendance_manager: "Attendance Manager", branch_admin: "Branch Admin" };
      for (const e of emps) {
        rows.push([e.name, e.phone, e.email ?? "", e.role, dept(e), Number(e.salary), e.salaryType, e.joiningDate, statusLabel(e.status), access[e.accessRole ?? "employee"] ?? "Employee"]);
      }
      break;
    }
  }

  return { title: REPORT_META[key].title, filename: reportFilename(key, p), rows };
}