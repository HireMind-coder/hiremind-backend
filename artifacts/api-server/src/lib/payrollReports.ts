// The payroll reports: pay slips (printable page) and CSV reports. Pure functions, no database access.

import { localKey } from "./notificationFeed";
import { daysInMonth, monthRange, type Cell } from "./reportBuilders";
import {
  computePayroll, ctcOf, r2,
  type PayAtt, type PayEmp, type PayPayment, type PayrollLine,
} from "./payroll";
import type { PayrollConfig } from "./payrollConfig";

export type PayrollReportKey =
  | "pay_slips"
  | "ctc_breakdown"
  | "salary_sheet_ctc"
  | "incentive_sheet"
  | "reimbursement_report"
  | "pf_challan"
  | "esi_report"
  | "esi_challan"
  | "loan_report"
  | "tds_report";

export const PAYROLL_REPORT_META: Record<PayrollReportKey, { title: string; format: "csv" | "html" }> = {
  pay_slips: { title: "Pay Slips", format: "html" },
  ctc_breakdown: { title: "CTC Breakdown Report", format: "csv" },
  salary_sheet_ctc: { title: "Salary Sheet (with CTC Breakdown)", format: "csv" },
  incentive_sheet: { title: "Incentive Sheet", format: "csv" },
  reimbursement_report: { title: "Reimbursement Report", format: "csv" },
  pf_challan: { title: "Provident Fund Challan Report", format: "csv" },
  esi_report: { title: "ESI Report", format: "csv" },
  esi_challan: { title: "ESI Challan Report", format: "csv" },
  loan_report: { title: "Loan Report", format: "csv" },
  tds_report: { title: "Tax Deducted at Source Report", format: "csv" },
};

export const isPayrollKey = (k: string): k is PayrollReportKey =>
  Object.prototype.hasOwnProperty.call(PAYROLL_REPORT_META, k);

export interface PayrollParams {
  month: number;
  year: number;
  department?: string | null;
}

export interface PayrollData {
  company: string;
  employees: PayEmp[];
  attendance: PayAtt[]; // the selected month
  payments: PayPayment[]; // everything for these employees (filtered here)
  timeZone?: string;
}

export type PayrollResult =
  | { kind: "csv"; filename: string; rows: Cell[][] }
  | { kind: "html"; filename: string; html: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export function parsePayrollParams(
  q: Record<string, unknown>,
): { ok: true; key: PayrollReportKey; params: PayrollParams } | { ok: false; error: string } {
  const key = String(q.report ?? "");
  if (!isPayrollKey(key)) return { ok: false, error: "Unknown report" };
  const month = Number(q.month);
  const year = Number(q.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: "Choose a valid month" };
  }
  const params: PayrollParams = { month, year };
  const dep = String(q.department ?? "").trim();
  if (dep && dep !== "all") {
    if (dep.length > 100) return { ok: false, error: "Department name is too long" };
    params.department = dep;
  }
  return { ok: true, key, params };
}

export function payrollFilename(key: PayrollReportKey, p: { month: number; year: number }): string {
  const meta = PAYROLL_REPORT_META[key];
  const base = meta.title.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${base}_${MONTHS[p.month - 1]}_${p.year}.${meta.format === "html" ? "html" : "csv"}`;
}

// ── HTML pay slips ───────────────────────────────────────────────────────────

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const money = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function slipHtml(L: PayrollLine, company: string, label: string, cfg: PayrollConfig): string {
  const e = (name: string, amount: number) => (amount ? `<tr><td>${esc(name)}</td><td class="n">${money(amount)}</td></tr>` : "");
  const earnings =
    e("Basic", L.earned.basic) + e("HRA", L.earned.hra) + e("Special Allowance", L.earned.special) +
    e("Overtime", L.overtimePay) + e("Incentives / Bonus", L.incentives) + e("Reimbursements", L.reimbursements);
  const deductions =
    e("Provident Fund", L.pfDeduction) + e("ESI", L.esiDeduction) + e("TDS", L.tds) +
    e("Loan repayment", L.loanRepayment) + e("Deductions", L.otherDeductions) + e("Advances", L.advances);
  const employer =
    L.employerPf || L.employerEsi
      ? `<p class="small">Employer contributions (not deducted from you): PF ${money(L.employerPf)}${cfg.esiEnabled ? `, ESI ${money(L.employerEsi)}` : ""}</p>`
      : "";
  return `
<section class="slip">
  <h1>${esc(company)}</h1>
  <h2>Pay Slip for ${esc(label)}</h2>
  <table class="info">
    <tr><td>Employee</td><td><b>${esc(L.emp.name)}</b></td><td>Department</td><td>${esc(L.emp.department || "-")}</td></tr>
    <tr><td>Designation</td><td>${esc(L.emp.role || "-")}</td><td>Paid days</td><td>${esc(L.paidDays)} of ${esc(L.workingDays)}</td></tr>
  </table>
  <div class="cols">
    <table class="box"><thead><tr><th>Earnings</th><th class="n">Amount</th></tr></thead><tbody>${earnings || '<tr><td colspan="2">-</td></tr>'}</tbody>
      <tfoot><tr><td>Gross Earnings</td><td class="n">${money(L.grossEarnings)}</td></tr></tfoot></table>
    <table class="box"><thead><tr><th>Deductions</th><th class="n">Amount</th></tr></thead><tbody>${deductions || '<tr><td colspan="2">-</td></tr>'}</tbody>
      <tfoot><tr><td>Total Deductions</td><td class="n">${money(L.totalDeductions)}</td></tr></tfoot></table>
  </div>
  <p class="net">Net Pay: ${money(L.netPay)}</p>
  <p class="small">Paid so far: ${money(L.paid)} &nbsp;|&nbsp; Pending: ${money(L.pending)}</p>
  ${employer}
  <p class="small muted">This is a computer-generated pay slip.</p>
</section>`;
}

function payslipsPage(lines: PayrollLine[], company: string, label: string, cfg: PayrollConfig, nonce: string): string {
  const slips = lines.map((l) => slipHtml(l, company, label, cfg)).join("\n");
  const body = lines.length
    ? slips
    : `<section class="slip"><h2>No pay slips for ${esc(label)}</h2><p>There is no attendance or payment recorded for this month.</p></section>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pay Slips - ${esc(label)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#f3f4f6;margin:0;padding:12px}
.bar{display:flex;gap:12px;align-items:center;max-width:760px;margin:0 auto 12px}
.bar button{background:#10b981;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-size:16px;font-weight:700}
.slip{max-width:760px;margin:0 auto 18px;background:#fff;border:1px solid #d1d5db;border-radius:8px;padding:22px;page-break-after:always}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:4px 0 14px;color:#374151}
table{width:100%;border-collapse:collapse;font-size:13px}
.info td{padding:3px 6px}.cols{display:flex;gap:12px;margin-top:12px;flex-wrap:wrap}
.box{flex:1;min-width:230px;border:1px solid #d1d5db}
.box th,.box td{padding:7px 8px;border-bottom:1px solid #e5e7eb;text-align:left}
.box thead th{background:#f3f4f6}.box tfoot td{font-weight:700;background:#f9fafb}
.n{text-align:right!important}
.net{font-size:18px;font-weight:700;margin:16px 0 4px}.small{font-size:12px;margin:2px 0}.muted{color:#6b7280}
@media print{body{background:#fff;padding:0}.noprint{display:none}.slip{border:0;margin:0;border-radius:0}}
</style></head><body>
<div class="bar noprint"><button id="print">Print / Save as PDF</button><span>${lines.length} pay slip${lines.length === 1 ? "" : "s"} &middot; ${esc(label)}</span></div>
${body}
<script nonce="${esc(nonce)}">document.getElementById("print").addEventListener("click",function(){window.print()});</script>
</body></html>`;
}

// ── CSV reports ──────────────────────────────────────────────────────────────

export function buildPayrollReport(
  key: PayrollReportKey,
  p: PayrollParams,
  d: PayrollData,
  cfg: PayrollConfig,
  nonce = "",
): PayrollResult {
  const { month, year } = p;
  const filename = payrollFilename(key, p);
  const label = `${MONTHS[month - 1]} ${year}`;
  const tz = d.timeZone;
  const range = monthRange(year, month);
  const workingDays = daysInMonth(year, month);
  const emps = [...d.employees].sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(emps.map((e) => [e.id, e]));
  const dept = (e?: PayEmp) => e?.department ?? "";
  const ym = year * 12 + month;

  const when = (x: PayPayment) => localKey(x.paidAt ?? x.createdAt, tz);
  const payYm = (x: PayPayment) => {
    if (x.month != null && x.year != null) return x.year * 12 + x.month;
    const k = when(x);
    return Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7));
  };
  const known = d.payments.filter((x) => byId.has(x.employeeId));
  const monthPays = known.filter((x) => payYm(x) === ym);

  const lineFor = (e: PayEmp): PayrollLine =>
    computePayroll({
      emp: e,
      attendance: d.attendance.filter((a) => a.employeeId === e.id && a.date >= range.start && a.date <= range.end),
      payments: monthPays.filter((x) => x.employeeId === e.id),
      workingDays, year, month, cfg,
    });

  const notes = (...lines: string[]): Cell[][] => [[""], ...lines.map((l) => [l])];
  const statutoryNote = (): string[] => {
    const out = [
      "Figures are calculated from the statutory rates (PF wage ceiling Rs 25,000 from 17 Sep 2026, Rs 15,000 before; ESI up to Rs 21,000 gross).",
      "Please verify with your CA or on the EPFO / ESIC portal before filing.",
    ];
    if (!cfg.pfEnabled) out.push("PF is switched OFF in payroll settings (PAYROLL_PF_ENABLED), so it is not deducted in pay slips; this report shows what PF would be.");
    if (!cfg.esiEnabled) out.push("ESI is switched OFF in payroll settings (PAYROLL_ESI_ENABLED), so it is not deducted in pay slips; this report shows what ESI would be.");
    return out;
  };

  const listPayments = (types: string[], header: Cell[], row: (x: PayPayment, e: PayEmp, date: string) => Cell[], totalLabel: string) => {
    const rows: Cell[][] = [header];
    const list = monthPays
      .filter((x) => types.includes(x.type))
      .map((x) => ({ x, date: when(x).slice(0, 10) }))
      .sort((a, b) => (a.date === b.date ? a.x.id - b.x.id : a.date < b.date ? -1 : 1));
    let total = 0;
    let totalPaid = 0;
    for (const { x, date } of list) {
      total += Number(x.amount);
      if (x.status === "paid") totalPaid += Number(x.amount);
      rows.push(row(x, byId.get(x.employeeId)!, date));
    }
    rows.push([totalLabel, "", "", "", r2(total), `Paid: ${r2(totalPaid)}`]);
    return rows;
  };

  switch (key) {
    case "pay_slips": {
      const lines = emps
        .map(lineFor)
        .filter((l) => l.paidDays > 0 || l.grossEarnings !== 0 || l.totalDeductions !== 0);
      return { kind: "html", filename, html: payslipsPage(lines, d.company, label, cfg, nonce) };
    }

    case "ctc_breakdown": {
      const rows: Cell[][] = [[
        "Employee", "Department", "Job Role", "Salary Type", "Monthly Gross", "Basic", "HRA", "Special Allowance",
        "Employer PF (EPF + EPS)", "EDLI + PF Admin", "Employer ESI", "Monthly CTC", "Annual CTC",
      ]];
      const t = { gross: 0, monthly: 0, annual: 0 };
      for (const e of emps) {
        const c = ctcOf(e, year, month, cfg);
        t.gross += c.gross; t.monthly += c.monthly; t.annual += c.annual;
        rows.push([e.name, dept(e), e.role, e.salaryType, c.gross, c.basic, c.hra, c.special, c.employerPf, c.edliAdmin, c.employerEsi, c.monthly, c.annual]);
      }
      rows.push(["Total", "", "", "", r2(t.gross), "", "", "", "", "", "", r2(t.monthly), r2(t.annual)]);
      rows.push(...notes(
        `Salary structure: Basic ${cfg.basicPercent}% of gross, HRA ${cfg.hraPercentOfBasic}% of Basic, the rest Special Allowance. Daily-wage staff are counted as daily wage x ${cfg.dailyWageDays} days.`,
        ...(cfg.pfEnabled || cfg.esiEnabled ? [] : ["Employer PF / ESI show 0 because both are switched OFF in payroll settings, so CTC equals gross."]),
      ));
      return { kind: "csv", filename, rows };
    }

    case "salary_sheet_ctc": {
      const rows: Cell[][] = [[
        "Employee", "Department", "Job Role", "Salary Type", "Monthly Gross", "Working Days", "Paid Days",
        "Basic", "HRA", "Special Allowance", "Overtime Pay", "Incentives", "Reimbursements", "Gross Earnings",
        "Employee PF", "Employee ESI", "TDS", "Loan Repayment", "Deductions", "Advances", "Net Pay",
        "Employer PF", "Employer ESI", "Paid", "Pending",
      ]];
      const t = { ge: 0, pf: 0, esi: 0, tds: 0, loan: 0, ded: 0, adv: 0, net: 0, epf: 0, eesi: 0, paid: 0, pend: 0 };
      for (const e of emps) {
        const l = lineFor(e);
        t.ge += l.grossEarnings; t.pf += l.pfDeduction; t.esi += l.esiDeduction; t.tds += l.tds; t.loan += l.loanRepayment;
        t.ded += l.otherDeductions; t.adv += l.advances; t.net += l.netPay; t.epf += l.employerPf; t.eesi += l.employerEsi;
        t.paid += l.paid; t.pend += l.pending;
        rows.push([
          e.name, dept(e), e.role, e.salaryType, l.monthlyGross, workingDays, l.paidDays,
          l.earned.basic, l.earned.hra, l.earned.special, l.overtimePay, l.incentives, l.reimbursements, l.grossEarnings,
          l.pfDeduction, l.esiDeduction, l.tds, l.loanRepayment, l.otherDeductions, l.advances, l.netPay,
          l.employerPf, l.employerEsi, l.paid, l.pending,
        ]);
      }
      rows.push(["Total", "", "", "", "", "", "", "", "", "", "", "", "", r2(t.ge), r2(t.pf), r2(t.esi), r2(t.tds), r2(t.loan), r2(t.ded), r2(t.adv), r2(t.net), r2(t.epf), r2(t.eesi), r2(t.paid), r2(t.pend)]);
      rows.push(...notes(
        "This sheet also counts incentives, reimbursements, TDS and loan repayments, so Net Pay can differ from the plain Salary Sheet.",
        ...(cfg.pfEnabled && cfg.esiEnabled ? [] : ["PF / ESI are deducted only when switched ON in payroll settings."]),
      ));
      return { kind: "csv", filename, rows };
    }

    case "incentive_sheet": {
      const rows = listPayments(
        ["incentive", "bonus"],
        ["Date", "Employee", "Department", "Type", "Amount", "Status", "Note"],
        (x, e, date) => [date, e.name, dept(e), x.type, r2(Number(x.amount)), x.status, x.note ?? ""],
        "Total",
      );
      return { kind: "csv", filename, rows };
    }

    case "reimbursement_report": {
      const rows = listPayments(
        ["reimbursement"],
        ["Date", "Employee", "Department", "Method", "Amount", "Status", "Note"],
        (x, e, date) => [date, e.name, dept(e), x.method, r2(Number(x.amount)), x.status, x.note ?? ""],
        "Total",
      );
      return { kind: "csv", filename, rows };
    }

    case "tds_report": {
      const rows = listPayments(
        ["tds"],
        ["Date", "Employee", "Department", "PAN", "Amount Deducted", "Status", "Note"],
        (x, e, date) => [date, e.name, dept(e), "", r2(Number(x.amount)), x.status, x.note ?? ""],
        "Total",
      );
      rows.push(...notes(
        "TDS amounts are the ones recorded as 'TDS' payments. The app does not calculate income tax, and it does not store PAN numbers yet (PAN column is empty).",
      ));
      return { kind: "csv", filename, rows };
    }

    case "loan_report": {
      const rows: Cell[][] = [["Employee", "Department", "Loan Given", "Repaid", "Outstanding Balance", "Last Loan Date", "Last Repayment Date"]];
      const upTo = known.filter((x) => payYm(x) <= ym);
      let tg = 0, tr = 0;
      for (const e of emps) {
        const mine = upTo.filter((x) => x.employeeId === e.id);
        const loans = mine.filter((x) => x.type === "loan" && x.status === "paid");
        const repay = mine.filter((x) => x.type === "loan_repayment");
        const given = loans.reduce((s, x) => s + Number(x.amount), 0);
        const repaid = repay.reduce((s, x) => s + Number(x.amount), 0);
        if (given === 0 && repaid === 0) continue;
        const last = (list: PayPayment[]) => list.map((x) => when(x).slice(0, 10)).sort().at(-1) ?? "";
        tg += given; tr += repaid;
        rows.push([e.name, dept(e), r2(given), r2(repaid), r2(given - repaid), last(loans), last(repay)]);
      }
      rows.push(["Total", "", r2(tg), r2(tr), r2(tg - tr), "", ""]);
      rows.push(...notes(
        `Balances are as at the end of ${label}. Record a loan as a 'Loan' payment (status paid) and each instalment as a 'Loan repayment' payment.`,
      ));
      return { kind: "csv", filename, rows };
    }

    case "pf_challan": {
      const rows: Cell[][] = [[
        "Employee", "UAN", "Paid Days", "Basic Earned", "PF Wages", "Employee PF (12%)",
        "Employer EPF", "Employer EPS (8.33%)", "EDLI (0.5%)", "Admin Charges (0.5%)", "Total",
      ]];
      const t = { wage: 0, employee: 0, epf: 0, eps: 0, edli: 0, admin: 0 };
      for (const e of emps) {
        const l = lineFor(e);
        if (l.pf.wage <= 0) continue;
        const rowTotal = l.pf.employee + l.pf.employerEpf + l.pf.eps + l.pf.edli + l.pf.admin;
        t.wage += l.pf.wage; t.employee += l.pf.employee; t.epf += l.pf.employerEpf; t.eps += l.pf.eps; t.edli += l.pf.edli; t.admin += l.pf.admin;
        rows.push([e.name, "", l.paidDays, l.earned.basic, l.pf.wage, l.pf.employee, l.pf.employerEpf, l.pf.eps, l.pf.edli, l.pf.admin, rowTotal]);
      }
      rows.push(["Total", "", "", "", r2(t.wage), t.employee, t.epf, t.eps, t.edli, t.admin, t.employee + t.epf + t.eps + t.edli + t.admin]);

      const adminTotal = t.wage > 0 ? Math.max(Math.round(t.wage * 0.005), cfg.pfAdminMin) : 0;
      const acc01 = t.employee + t.epf;
      const grand = acc01 + t.eps + adminTotal + t.edli;
      rows.push([""], ["Challan summary"]);
      rows.push(["A/c 01 - EPF (employee 12% + employer EPF)", acc01]);
      rows.push(["A/c 10 - EPS (employer 8.33%)", t.eps]);
      rows.push([`A/c 02 - Administration charges (0.5%, minimum Rs ${cfg.pfAdminMin})`, adminTotal]);
      rows.push(["A/c 21 - EDLI (0.5%)", t.edli]);
      rows.push(["A/c 22 - EDLI administration charges", 0]);
      rows.push(["Total payable", grand]);
      rows.push(...notes(...statutoryNote(), "The UAN column is empty because the app does not store UAN numbers yet; fill it in before uploading to EPFO."));
      return { kind: "csv", filename, rows };
    }

    case "esi_report": {
      const rows: Cell[][] = [["Employee", "ESIC IP Number", "Paid Days", "ESI Wages", "Employee (0.75%)", "Employer (3.25%)", "Total"]];
      const t = { wage: 0, emp: 0, er: 0 };
      for (const e of emps) {
        const l = lineFor(e);
        if (!l.esi.covered) continue;
        t.wage += l.esi.wage; t.emp += l.esi.employee; t.er += l.esi.employer;
        rows.push([e.name, "", l.paidDays, l.esi.wage, l.esi.employee, l.esi.employer, l.esi.employee + l.esi.employer]);
      }
      rows.push(["Total", "", "", r2(t.wage), t.emp, t.er, t.emp + t.er]);
      rows.push(...notes(
        `Only employees whose monthly gross is Rs ${cfg.esiCeiling.toLocaleString("en-IN")} or less are covered. Wages exclude overtime, bonus and reimbursements.`,
        ...statutoryNote(),
        "The ESIC IP Number column is empty because the app does not store it yet.",
      ));
      return { kind: "csv", filename, rows };
    }

    case "esi_challan": {
      let covered = 0, wage = 0, emp = 0, er = 0;
      for (const e of emps) {
        const l = lineFor(e);
        if (!l.esi.covered) continue;
        covered += 1; wage += l.esi.wage; emp += l.esi.employee; er += l.esi.employer;
      }
      const nextMonth = month === 12 ? `Jan ${year + 1}` : `${MONTHS[month]} ${year}`;
      const rows: Cell[][] = [
        ["ESI Challan Summary", ""],
        ["Establishment", d.company],
        ["Contribution month", label],
        ["Employees covered", covered],
        ["Total ESI wages", r2(wage)],
        ["Employee contribution (0.75%)", emp],
        ["Employer contribution (3.25%)", er],
        ["Total payable", emp + er],
        ["Due by", `15 ${nextMonth}`],
      ];
      rows.push(...notes(...statutoryNote()));
      return { kind: "csv", filename, rows };
    }
  }
}