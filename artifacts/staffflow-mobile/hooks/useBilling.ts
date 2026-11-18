import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type PlanItem = { id: string; name: string; description: string };

export type BillingSummary = {
  staffLimit: number;
  activeStaff: number;
  validTill: string;
  status: "active" | "expiring" | "expired";
  daysLeft: number;
  isTrial: boolean;
  featureIds: string[];
  addonIds: string[];
  features: PlanItem[];
  addons: PlanItem[];
  walletBalancePaise: number;
};

export type BillingCatalog = {
  staffLimits: number[];
  features: Array<PlanItem & { pricePerStaffYear: number }>;
  addons: Array<PlanItem & { priceYear: number }>;
  durations: Array<{ months: number; label: string; discountPercent: number }>;
  gstRate: number;
  states: string[];
};

export type Quote = {
  type: "upgrade" | "renew";
  durationMonths: number;
  lines: Array<{ label: string; amountPaise: number }>;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
  newValidTill: string;
};

export type OrderParams = {
  type: "upgrade" | "renew";
  staffLimit: number;
  features: string[];
  addons: string[];
  durationMonths: number;
};

export const SUMMARY_KEY = ["billing-summary"];
export const CATALOG_KEY = ["billing-catalog"];
export const DETAILS_KEY = ["billing-details"];

export function useBillingSummary() {
  return useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => customFetch<BillingSummary>("/api/billing/summary"),
    throwOnError: false,
  });
}

export function useBillingCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => customFetch<BillingCatalog>("/api/billing/catalog"),
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });
}

export function errText(e: any, fallback = "Something went wrong. Please try again."): string {
  return e?.data?.error ?? e?.message ?? fallback;
}

/** 123456 paise -> "₹1,234.56" (no decimals when the amount is whole) */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const whole = Math.abs(rupees % 1) < 0.005;
  const text = Math.abs(rupees).toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${rupees < 0 ? "-" : ""}₹${text}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}