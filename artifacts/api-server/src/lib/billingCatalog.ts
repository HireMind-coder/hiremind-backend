// ─────────────────────────────────────────────────────────────────────────────
// Everything you may want to change lives in this file: prices, staff limits,
// features, add-ons, durations and the seller details printed on invoices.
//
// !! The prices below are PLACEHOLDERS — replace them with your real pricing. !!
// Prices are in rupees (the app converts to paise internally).
// ─────────────────────────────────────────────────────────────────────────────

export const TRIAL_DAYS = 30;
export const DEFAULT_STAFF_LIMIT = 20;
export const GST_RATE = 0.18;

export const STAFF_LIMITS = [10, 20, 50, 100, 200, 500];

export type CatalogFeature = {
  id: string;
  name: string;
  description: string;
  pricePerStaffYear: number; // rupees per staff, per year
};

export type CatalogAddon = {
  id: string;
  name: string;
  description: string;
  priceYear: number; // rupees per year, flat
};

export const FEATURES: CatalogFeature[] = [
  { id: "attendance_lite", name: "Attendance Lite", description: "Daily attendance, leaves and holidays", pricePerStaffYear: 240 },
  { id: "payroll_pro", name: "Payroll Pro", description: "Salary, payslips and payments", pricePerStaffYear: 360 },
  { id: "face_attendance", name: "Face Attendance", description: "Face recognition punch-in and kiosk mode", pricePerStaffYear: 180 },
  { id: "live_tracking", name: "Live Tracking", description: "Auto-Live Track and live locations", pricePerStaffYear: 120 },
];

export const ADDONS: CatalogAddon[] = [
  { id: "custom_reports", name: "Custom Reports", description: "Extra report formats and exports", priceYear: 1500 },
  { id: "priority_support", name: "Priority Support", description: "Faster support response", priceYear: 3000 },
];

export const DEFAULT_FEATURES = ["attendance_lite", "payroll_pro"];

export const DURATIONS = [
  { months: 12, label: "1 YEAR", discountPercent: 0 },
  { months: 24, label: "2 YEARS", discountPercent: 5 },
  { months: 36, label: "3 YEARS", discountPercent: 10 },
];

// Printed on the invoice as the seller. Fill in your real registered details.
export const SELLER = {
  name: "Allegient Unified Technology Pvt Ltd",
  address: "Your registered office address",
  gstin: "",
  email: "support@example.com",
};

// ─── GST state codes (first two digits of a GSTIN) ──────────────────────────
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Dadra and Nagar Haveli and Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

export const STATE_NAMES: string[] = Array.from(new Set(Object.values(GST_STATE_CODES))).sort();