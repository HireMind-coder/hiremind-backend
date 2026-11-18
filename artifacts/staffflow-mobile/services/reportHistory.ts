import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "staffflow_report_history";
const MAX = 30;

export type ReportHistoryItem = {
  id: string;
  key: string;
  title: string;
  period: string; // e.g. "Oct 2026"
  department: string; // "All Departments" or a name
  query: string; // the request used, so the file can be downloaded again
  createdAt: number;
};

export async function loadReportHistory(): Promise<ReportHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ReportHistoryItem[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function addReportToHistory(item: Omit<ReportHistoryItem, "id" | "createdAt">) {
  const list = await loadReportHistory();
  // same report + same options: keep one entry, move it to the top
  const rest = list.filter((x) => x.query !== item.query);
  const next = [{ ...item, id: String(Date.now()), createdAt: Date.now() }, ...rest].slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function removeReportFromHistory(id: string) {
  const list = await loadReportHistory();
  await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((x) => x.id !== id)));
}