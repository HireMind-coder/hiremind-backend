import type { Ionicons } from "@expo/vector-icons";

export type ReportKey =
  | "attendance_summary"
  | "attendance_detailed"
  | "attendance_daily"
  | "late_arrival"
  | "leave_report"
  | "overtime_report"
  | "salary_sheet"
  | "payments_report"
  | "employee_list"
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

export type ReportDef = {
  key: ReportKey;
  title: string;
  needs: "month" | "date" | "none";
  /** "print" = opens as a page you can print or save as PDF; default is a CSV file */
  format?: "csv" | "print";
  blurb?: string;
};

export type ReportGroup = {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  reports: ReportDef[];
};

const VERIFY = "Please verify the figures with your CA before filing.";

export const REPORT_GROUPS: ReportGroup[] = [
  {
    id: "attendance",
    title: "Attendance",
    icon: "calendar-outline",
    reports: [
      { key: "attendance_summary", title: "Attendance Summary Report", needs: "month" },
      { key: "attendance_detailed", title: "Detailed Attendance Report", needs: "month" },
      { key: "attendance_daily", title: "Daily Attendance Report", needs: "date" },
      { key: "late_arrival", title: "Late Arrival Report", needs: "month" },
      { key: "leave_report", title: "Leave Report", needs: "month" },
      { key: "overtime_report", title: "Overtime Report", needs: "month" },
    ],
  },
  {
    id: "payroll",
    title: "Payroll",
    icon: "cash-outline",
    reports: [
      {
        key: "pay_slips", title: "Pay Slips", needs: "month", format: "print",
        blurb: "Opens one pay slip per employee in your browser. Tap “Print / Save as PDF” to keep or share them.",
      },
      { key: "salary_sheet", title: "Salary Sheet", needs: "month" },
      {
        key: "ctc_breakdown", title: "CTC Breakdown Report", needs: "month",
        blurb: "Splits each salary into Basic, HRA and Special Allowance and adds employer PF / ESI to give the cost to company.",
      },
      {
        key: "salary_sheet_ctc", title: "Salary Sheet (with CTC Breakdown)", needs: "month",
        blurb: "Includes incentives, reimbursements, TDS and loan repayments, so Net Pay can differ from the plain Salary Sheet.",
      },
      {
        key: "incentive_sheet", title: "Incentive Sheet", needs: "month",
        blurb: "Lists payments recorded as “Bonus” or “Incentive” for the month.",
      },
      {
        key: "reimbursement_report", title: "Reimbursement Report", needs: "month",
        blurb: "Lists payments recorded as “Reimbursement” for the month.",
      },
      {
        key: "pf_challan", title: "Provident Fund Challan Report", needs: "month",
        blurb: `Employee-wise PF and the account-wise challan summary. ${VERIFY}`,
      },
      {
        key: "esi_report", title: "ESI Report", needs: "month",
        blurb: `Employee-wise ESI for staff whose monthly gross is ₹21,000 or less. ${VERIFY}`,
      },
      {
        key: "esi_challan", title: "ESI Challan Report", needs: "month",
        blurb: `Total ESI payable for the month. ${VERIFY}`,
      },
      {
        key: "loan_report", title: "Loan Report", needs: "month",
        blurb: "Loan balance per employee as at the end of the month. Record loans as “Loan” and instalments as “Loan repayment” in Payments.",
      },
      {
        key: "tds_report", title: "Tax Deducted at Source Report", needs: "month",
        blurb: "Lists payments recorded as “TDS”. The app does not calculate income tax.",
      },
      { key: "payments_report", title: "Payments Report", needs: "month" },
    ],
  },
];

export const EMPLOYEE_LIST_REPORT: ReportDef = {
  key: "employee_list",
  title: "Employee List",
  needs: "none",
  blurb: "Download list of all employees in your company.",
};

export function findReport(key?: string): ReportDef | undefined {
  if (key === EMPLOYEE_LIST_REPORT.key) return EMPLOYEE_LIST_REPORT;
  for (const g of REPORT_GROUPS) {
    const hit = g.reports.find((r) => r.key === key);
    if (hit) return hit;
  }
  return undefined;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const monthLabel = (month: number, year: number) => `${MONTHS[month - 1]} ${year}`;

export function dayLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;