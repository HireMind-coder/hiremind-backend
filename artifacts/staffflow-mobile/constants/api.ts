export function getBaseUrl(): string {
  const raw = (process.env.EXPO_PUBLIC_DOMAIN ?? "").trim();
  if (!raw) return "http://10.0.2.2:3000";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  const protocol = raw.includes("railway.app") ? "https" : "http";
  return `${protocol}://${raw.replace(/\/+$/, "")}`;
}