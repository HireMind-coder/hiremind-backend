// Payroll settings. Everything can be changed from api-server\.env (no code edits needed).
//
//   PAYROLL_PF_ENABLED=true        deduct PF in pay slips / salary sheet with CTC (default: false)
//   PAYROLL_ESI_ENABLED=true       deduct ESI in pay slips / salary sheet with CTC (default: false)
//   PAYROLL_BASIC_PERCENT=50       Basic = 50% of monthly gross
//   PAYROLL_HRA_PERCENT=40         HRA = 40% of Basic
//   PAYROLL_DAILY_WAGE_DAYS=26     monthly gross for daily-wage staff = daily wage x 26
//   PAYROLL_PF_WAGE_CEILING=25000  force one PF wage ceiling for every month (optional)
//   PAYROLL_PF_ADMIN_MIN=500       minimum PF admin charge per challan
//   PAYROLL_ESI_CEILING=21000      ESI applies up to this monthly gross

export interface PayrollConfig {
  basicPercent: number;
  hraPercentOfBasic: number;
  dailyWageDays: number;
  pfEnabled: boolean;
  pfCeilingOverride: number | null;
  pfAdminMin: number;
  esiEnabled: boolean;
  esiCeiling: number;
}

type Env = Record<string, string | undefined>;

const num = (v: string | undefined, fallback: number, min: number, max: number): number => {
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const flag = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined || v.trim() === "" ? fallback : /^(1|true|yes|on)$/i.test(v.trim());

export function getPayrollConfig(env: Env = process.env): PayrollConfig {
  const override = num(env.PAYROLL_PF_WAGE_CEILING, 0, 1, 10_000_000);
  return {
    basicPercent: num(env.PAYROLL_BASIC_PERCENT, 50, 1, 100),
    hraPercentOfBasic: num(env.PAYROLL_HRA_PERCENT, 40, 0, 100),
    dailyWageDays: num(env.PAYROLL_DAILY_WAGE_DAYS, 26, 1, 31),
    pfEnabled: flag(env.PAYROLL_PF_ENABLED, false),
    pfCeilingOverride: override > 0 ? override : null,
    pfAdminMin: num(env.PAYROLL_PF_ADMIN_MIN, 500, 0, 100000),
    esiEnabled: flag(env.PAYROLL_ESI_ENABLED, false),
    esiCeiling: num(env.PAYROLL_ESI_CEILING, 21000, 1, 10_000_000),
  };
}