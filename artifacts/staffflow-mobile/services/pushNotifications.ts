import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { customFetch } from "@workspace/api-client-react";

export const NOTIF_KEY = "staffflow_notifications_enabled";
const TOKEN_KEY = "staffflow_push_token";

type NotificationsModule = typeof import("expo-notifications");

// Expo Go (Android) crashes if expo-notifications is even imported,
// so it is only loaded inside a real development/production build.
export const pushSupported =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let cached: NotificationsModule | null = null;

export function getNotifications(): NotificationsModule | null {
  if (!pushSupported) return null;
  if (!cached) {
    cached = require("expo-notifications") as NotificationsModule;
    // Show notifications even while the app is open
    cached.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  return cached;
}

export type PushResult =
  | { ok: true; token: string }
  | { ok: false; reason: "unsupported" | "denied" | "no-project-id" | "error"; message?: string };

/** Ask permission, get this phone's Expo push token, and save it on the server. */
export async function registerForPush(): Promise<PushResult> {
  const Notifications = getNotifications();
  if (!Notifications) return { ok: false, reason: "unsupported" };

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#576DFA",
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return { ok: false, reason: "denied" };

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, reason: "no-project-id" };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log("Expo push token:", token);

    await customFetch("/api/push/register", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return { ok: true, token };
  } catch (e: any) {
    console.log("Push registration failed:", e?.message ?? e);
    return { ok: false, reason: "error", message: e?.message };
  }
}

/** Tell the server to stop sending to this phone (call BEFORE clearing the login token). */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await customFetch("/api/push/unregister", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // best effort
  }
}