// Builds the "Notifications" feed from existing tables (no extra database table needed).
// Every item carries `at` = "YYYY-MM-DD HH:mm" in the company's timezone, so the phone
// can sort and display it without doing any timezone maths.

export type FeedType = "attendance" | "leave" | "task" | "payment";

export interface FeedItem {
  id: string;
  type: FeedType;
  employeeId: number;
  employeeName: string;
  message: string;
  at: string;
}

interface AttRow { id: number; employeeId: number; date: string; status: string; checkIn: string | null; checkOut: string | null; createdAt: Date }
interface LeaveRow { id: number; employeeId: number; type: string; days: number; status: string; createdAt: Date; updatedAt: Date }
interface TaskRow { id: number; employeeId: number; title: string; createdAt: Date }
interface PayRow { id: number; employeeId: number; amount: string | number; type: string; status: string; paidAt: Date | null; createdAt: Date }

/** "2026-10-12 09:56" for a moment in time, expressed in the given timezone. */
export function localKey(d: Date, timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** Accepts "09:56", "9:56", "09:56:30", "09:56 AM", "9:56 pm" -> "HH:mm" (24h), or null. */
export function toHHmm(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?\s*$/.exec(value);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const STATUS_TEXT: Record<string, string> = {
  present: "was marked present.",
  absent: "was marked absent.",
  half_day: "was marked half day.",
};

export function buildFeed(input: {
  names: Map<number, string>;
  attendance: AttRow[];
  leaves: LeaveRow[];
  tasks: TaskRow[];
  payments: PayRow[];
  type: FeedType | null;
  sinceKey: string;
  limit: number;
  timeZone?: string;
}): { items: FeedItem[]; hasMore: boolean } {
  const { names, type, sinceKey, limit, timeZone } = input;
  const items: FeedItem[] = [];
  const nameOf = (id: number) => names.get(id) ?? "Employee";
  const add = (i: FeedItem) => {
    if (i.at >= sinceKey) items.push(i);
  };

  if (!type || type === "attendance") {
    for (const a of input.attendance) {
      const name = nameOf(a.employeeId);
      const inT = toHHmm(a.checkIn);
      const outT = toHHmm(a.checkOut);
      if (inT) add({ id: `att-in-${a.id}`, type: "attendance", employeeId: a.employeeId, employeeName: name, message: `${name} has punched in.`, at: `${a.date} ${inT}` });
      if (outT) add({ id: `att-out-${a.id}`, type: "attendance", employeeId: a.employeeId, employeeName: name, message: `${name} has punched out.`, at: `${a.date} ${outT}` });
      if (!inT && !outT) {
        add({
          id: `att-mark-${a.id}`, type: "attendance", employeeId: a.employeeId, employeeName: name,
          message: `${name} ${STATUS_TEXT[a.status] ?? `was marked ${a.status}.`}`,
          at: localKey(a.createdAt, timeZone),
        });
      }
    }
  }

  if (!type || type === "leave") {
    for (const l of input.leaves) {
      const name = nameOf(l.employeeId);
      add({
        id: `leave-req-${l.id}`, type: "leave", employeeId: l.employeeId, employeeName: name,
        message: `${name} requested ${l.days} day${l.days === 1 ? "" : "s"} of ${l.type} leave.`,
        at: localKey(l.createdAt, timeZone),
      });
      if (l.status === "approved" || l.status === "rejected") {
        add({
          id: `leave-${l.status}-${l.id}`, type: "leave", employeeId: l.employeeId, employeeName: name,
          message: `${name}'s ${l.type} leave was ${l.status}.`,
          at: localKey(l.updatedAt, timeZone),
        });
      }
    }
  }

  if (!type || type === "task") {
    for (const t of input.tasks) {
      const name = nameOf(t.employeeId);
      add({
        id: `task-${t.id}`, type: "task", employeeId: t.employeeId, employeeName: name,
        message: `${name} was assigned a task: ${t.title}`,
        at: localKey(t.createdAt, timeZone),
      });
    }
  }

  if (!type || type === "payment") {
    for (const p of input.payments) {
      const name = nameOf(p.employeeId);
      const amount = Number(p.amount).toLocaleString("en-IN");
      add({
        id: `pay-${p.id}`, type: "payment", employeeId: p.employeeId, employeeName: name,
        message: p.status === "paid"
          ? `₹${amount} ${p.type} paid to ${name}.`
          : `₹${amount} ${p.type} for ${name} is ${p.status}.`,
        at: localKey(p.paidAt ?? p.createdAt, timeZone),
      });
    }
  }

  // newest first
  items.sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1));
  return { items: items.slice(0, limit), hasMore: items.length > limit };
}