// Payroll calculations used by pay slips and the payroll reports.
// Statutory rules (checked against sources dated Sept-Oct 2026):
//  - PF wage ceiling: Rs 15,000 before 17 Sep 2026, Rs 25,000 from 17 Sep 2026 (Sep 2026 is a split month).
//  - PF: employee 12%; employer 12% = 8.33% EPS + remainder EPF; EDLI 0.5%; admin 0.5% (minimum per challan).
//  - ESI: applies up to Rs 21,000 monthly gross; employee 0.75%, employer 3.25%;
//    employee share exempt when the average daily wage is Rs 176 or less.
// Always confirm figures with your CA / the EPFO and ESIC portals before filing.

import type { PayrollConfig } from "./payrollConfig";

export const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PayEmp {
  id: number; name: string; role: string; department: string | null;
  salary: string | number; salaryType: string;
}
export interface PayAtt { employeeId: number; date: string; status: string; overtimeHours: number | null }
export interface PayPayment {
  id: number; employeeId: number; amount: string | number; type: string; method: string;
  month: number | null; year: number | null; note: string | null; status: string;
  paidAt: Date | null; createdAt: Date;
}

/** Payment types that reduce what the employee takes home. */
export const DEDUCTION_TYPES = ["deduction", "advance", "tds", "loan_repayment"];

// ── Salary structure ─────────────────────────────────────────────────────────

export function monthlyGross(emp: Pick<PayEmp, "salary" | "salaryType">, cfg: PayrollConfig): number {
  const s = Number(emp.salary) || 0;
  return emp.salaryType === "daily" ? s * cfg.dailyWageDays : s;
}

export function structureOf(gross: number, cfg: PayrollConfig) {
  const basic = r2((gross * cfg.basicPercent) / 100);
  const hra = r2((basic * cfg.hraPercentOfBasic) / 100);
  const special = Math.max(0, r2(gross - basic - hra));
  return { basic, hra, special };
}

// ── PF ───────────────────────────────────────────────────────────────────────

/** The part of basic pay that PF is calculated on, after applying the wage ceiling for that month. */
export function pfWageFor(basic: number, year: number, month: number, cfg: PayrollConfig): number {
  const w = Math.max(0, basic);
  if (cfg.pfCeilingOverride != null) return r2(Math.min(w, cfg.pfCeilingOverride));
  const ym = year * 12 + month;
  const sep2026 = 2026 * 12 + 9;
  if (ym < sep2026) return r2(Math.min(w, 15000));
  if (ym > sep2026) return r2(Math.min(w, 25000));
  // The ceiling changed on 17 Sep 2026: 16 days at Rs 15,000 and 14 days at Rs 25,000.
  return r2((16 / 30) * Math.min(w, 15000) + (14 / 30) * Math.min(w, 25000));
}

export interface PfParts {
  wage: number; employee: number; employerEpf: number; eps: number; edli: number; admin: number;
}

export function pfContrib(pfWage: number): PfParts {
  const employee = Math.round(pfWage * 0.12);
  const eps = Math.round(pfWage * 0.0833);
  const employerEpf = Math.round(pfWage * 0.12) - eps;
  return {
    wage: pfWage,
    employee,
    employerEpf,
    eps,
    edli: Math.round(pfWage * 0.005),
    admin: Math.round(pfWage * 0.005),
  };
}

// ── ESI ──────────────────────────────────────────────────────────────────────

export interface EsiParts { covered: boolean; wage: number; employee: number; employer: number }

export function esiContrib(
  monthlyGrossPay: number,
  earnedWages: number,
  paidDays: number,
  cfg: PayrollConfig,
): EsiParts {
  const covered = monthlyGrossPay > 0 && monthlyGrossPay <= cfg.esiCeiling && paidDays > 0;
  if (!covered) return { covered: false, wage: 0, employee: 0, employer: 0 };
  const avgDaily = earnedWages / paidDays;
  return {
    covered: true,
    wage: r2(earnedWages),
    employee: avgDaily <= 176 ? 0 : Math.round(earnedWages * 0.0075),
    employer: Math.round(earnedWages * 0.0325),
  };
}

// ── One employee, one month ──────────────────────────────────────────────────

export interface PayrollLine {
  emp: PayEmp;
  monthlyGross: number;
  structure: { basic: number; hra: number; special: number };
  workingDays: number;
  presentDays: number;
  halfDays: number;
  paidDays: number;
  overtimeHours: number;
  earned: { basic: number; hra: number; special: number; gross: number };
  overtimePay: number;
  incentives: number;
  reimbursements: number;
  grossEarnings: number;
  pf: PfParts; // what PF would be (always calculated)
  esi: EsiParts; // what ESI would be (always calculated)
  pfDeduction: number; // applied only when PF is switched on
  esiDeduction: number; // applied only when ESI is switched on
  tds: number;
  loanRepayment: number;
  otherDeductions: number;
  advances: number;
  totalDeductions: number;
  netPay: number;
  employerPf: number; // applied employer cost (EPF + EPS + EDLI + admin) when PF is on
  employerEsi: number; // applied employer cost when ESI is on
  paid: number;
  pending: number;
}

export function computePayroll(args: {
  emp: PayEmp;
  attendance: PayAtt[]; // this employee's rows for the month
  payments: PayPayment[]; // this employee's payments for the month
  workingDays: number;
  year: number;
  month: number;
  cfg: PayrollConfig;
}): PayrollLine {
  const { emp, attendance, payments, workingDays, year, month, cfg } = args;

  const present = attendance.filter((a) => a.status === "present").length;
  const half = attendance.filter((a) => a.status === "half_day").length;
  const paidDays = present + half * 0.5;
  const ot = attendance.reduce((s, a) => s + (a.overtimeHours || 0), 0);

  const base = Number(emp.salary) || 0;
  const gross = monthlyGross(emp, cfg);
  const structure = structureOf(gross, cfg);

  // Same formulas as the app's own Salary screen
  const earnedGross =
    emp.salaryType === "daily"
      ? base * paidDays
      : workingDays > 0 ? (base / workingDays) * paidDays : 0;
  const overtimePay = workingDays > 0 ? ot * (base / workingDays / 8) : 0;

  const share = (part: number) => (gross > 0 ? part / gross : 0);
  const earnedBasic = r2(earnedGross * share(structure.basic));
  const earnedHra = r2(earnedGross * share(structure.hra));
  const earnedSpecial = r2(earnedGross - earnedBasic - earnedHra);

  const sum = (types: string[]) =>
    payments.filter((p) => types.includes(p.type)).reduce((s, p) => s + Number(p.amount), 0);
  const incentives = sum(["incentive", "bonus"]);
  const reimbursements = sum(["reimbursement"]);
  const tds = sum(["tds"]);
  const loanRepayment = sum(["loan_repayment"]);
  const otherDeductions = sum(["deduction"]);
  const advances = sum(["advance"]);

  const pf = pfContrib(paidDays > 0 ? pfWageFor(earnedBasic, year, month, cfg) : 0);
  const esi = esiContrib(gross, earnedGross, paidDays, cfg); // ESI wages exclude overtime / bonus / reimbursements

  const pfDeduction = cfg.pfEnabled ? pf.employee : 0;
  const esiDeduction = cfg.esiEnabled ? esi.employee : 0;

  const grossEarnings = earnedGross + overtimePay + incentives + reimbursements;
  const totalDeductions = pfDeduction + esiDeduction + tds + loanRepayment + otherDeductions + advances;
  const netPay = grossEarnings - totalDeductions;
  const paid = payments
    .filter((p) => p.type === "salary" && p.status === "paid")
    .reduce((s, p) => s + Number(p.amount), 0);

  return {
    emp, monthlyGross: gross, structure, workingDays,
    presentDays: present, halfDays: half, paidDays, overtimeHours: ot,
    earned: { basic: earnedBasic, hra: earnedHra, special: earnedSpecial, gross: r2(earnedGross) },
    overtimePay: r2(overtimePay), incentives: r2(incentives), reimbursements: r2(reimbursements),
    grossEarnings: r2(grossEarnings),
    pf, esi, pfDeduction, esiDeduction,
    tds: r2(tds), loanRepayment: r2(loanRepayment), otherDeductions: r2(otherDeductions), advances: r2(advances),
    totalDeductions: r2(totalDeductions), netPay: r2(netPay),
    employerPf: cfg.pfEnabled ? pf.employerEpf + pf.eps + pf.edli + pf.admin : 0,
    employerEsi: cfg.esiEnabled ? esi.employer : 0,
    paid: r2(paid), pending: r2(Math.max(0, netPay - paid)),
  };
}

/** Monthly cost to company for one employee on a full month's structure. */
export function ctcOf(emp: PayEmp, year: number, month: number, cfg: PayrollConfig) {
  const gross = monthlyGross(emp, cfg);
  const s = structureOf(gross, cfg);
  const pf = cfg.pfEnabled ? pfContrib(pfWageFor(s.basic, year, month, cfg)) : null;
  const employerPf = pf ? pf.employerEpf + pf.eps : 0;
  const edliAdmin = pf ? pf.edli + pf.admin : 0;
  const esi = cfg.esiEnabled ? esiContrib(gross, gross, 1, cfg) : null;
  const employerEsi = esi ? esi.employer : 0;
  const monthly = gross + employerPf + edliAdmin + employerEsi;
  return { gross, ...s, employerPf, edliAdmin, employerEsi, monthly: r2(monthly), annual: r2(monthly * 12) };
}