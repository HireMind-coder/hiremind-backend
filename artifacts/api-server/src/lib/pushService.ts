import { db, pushTokensTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushPayload = {
  title: string;
  body: string;
  /** In-app route opened when the notification is tapped, e.g. "/leaves" */
  screen?: string;
};

type ExpoTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

async function sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    channelId: "default",
    title: payload.title,
    body: payload.body,
    data: payload.screen ? { screen: payload.screen } : {},
  }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  // Expo accepts up to 100 messages per request
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(chunk),
      });
      const json = (await res.json()) as { data?: ExpoTicket[] };
      const dead: string[] = [];

      (json.data ?? []).forEach((ticket, idx) => {
        if (ticket.status === "error") {
          logger.warn({ message: ticket.message, details: ticket.details }, "Expo push ticket error");
          // Phone uninstalled the app / token expired -> forget it
          if (ticket.details?.error === "DeviceNotRegistered") dead.push(chunk[idx].to);
        }
      });

      if (dead.length > 0) {
        await db.delete(pushTokensTable).where(inArray(pushTokensTable.token, dead));
      }
    } catch (err) {
      logger.warn({ err }, "Expo push request failed");
    }
  }
}

/** Push to every phone logged in as this company's admin. Never throws. */
export async function notifyAdmin(adminId: number, payload: PushPayload): Promise<void> {
  try {
    const rows = await db
      .select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(and(eq(pushTokensTable.userType, "admin"), eq(pushTokensTable.adminId, adminId)));
    await sendToTokens(rows.map((r) => r.token), payload);
  } catch (err) {
    logger.warn({ err }, "notifyAdmin failed");
  }
}

/** Push to every phone logged in as this employee. Never throws. */
export async function notifyEmployee(employeeId: number, payload: PushPayload): Promise<void> {
  try {
    const rows = await db
      .select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(and(eq(pushTokensTable.userType, "employee"), eq(pushTokensTable.employeeId, employeeId)));
    await sendToTokens(rows.map((r) => r.token), payload);
  } catch (err) {
    logger.warn({ err }, "notifyEmployee failed");
  }
}