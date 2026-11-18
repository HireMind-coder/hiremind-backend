import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Linking, Platform } from "react-native";
import { customFetch } from "@workspace/api-client-react";
import { getBaseUrl } from "@/constants/api";

export const LIVE_TRACK_TASK = "hiremind-live-track";

const EXPIRY_KEY = "hiremind_live_track_expiry";
const CONSENT_KEY = "hiremind_live_track_consent";
const EMP_TOKEN_KEY = "staffflow_emp_token"; // same key AuthContext uses for employee logins
const TRACK_MS = 12 * 60 * 60 * 1000; // 12 hours

// ─────────────────────────────────────────────────────────────────────────────
// Background task. It must be defined at the top level of a module that is
// imported from app/_layout.tsx, so it is registered when the app starts.
// It does not rely on React state: it reads the login token itself.
// ─────────────────────────────────────────────────────────────────────────────
TaskManager.defineTask(LIVE_TRACK_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations || locations.length === 0) return;

  const expiry = Number((await AsyncStorage.getItem(EXPIRY_KEY)) ?? 0);
  if (!expiry || Date.now() > expiry) {
    await stopLiveTracking();
    return;
  }

  const token = await SecureStore.getItemAsync(EMP_TOKEN_KEY);
  if (!token) {
    // Employee logged out
    await stopLiveTracking();
    return;
  }

  try {
    const res = await fetch(`${getBaseUrl()}/api/live-track/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        points: locations.map((l) => ({
          latitude: l.coords.latitude,
          longitude: l.coords.longitude,
          accuracy: l.coords.accuracy,
          recordedAt: l.timestamp,
          mocked: Platform.OS === "android" ? (l as any).mocked === true : false,
        })),
      }),
    });

    if (res.status === 401 || res.status === 403) {
      await stopLiveTracking();
      return;
    }
    if (res.ok) {
      const json = await res.json().catch(() => null);
      // Server says: punched out, feature turned off, or 12 hours are over
      if (json && json.tracking === false) await stopLiveTracking();
    }
  } catch {
    // No network right now — the next batch will try again
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Start / stop
// ─────────────────────────────────────────────────────────────────────────────
export async function stopLiveTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LIVE_TRACK_TASK)) {
      await Location.stopLocationUpdatesAsync(LIVE_TRACK_TASK);
    }
  } catch {
    // already stopped
  }
  try {
    await AsyncStorage.removeItem(EXPIRY_KEY);
  } catch {
    // ignore
  }
}

/** Google Play wants a clear in-app notice before background location is used. Asked once. */
function askConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    AsyncStorage.getItem(CONSENT_KEY)
      .catch(() => null)
      .then((saved) => {
        if (saved === "yes") {
          resolve(true);
          return;
        }
        Alert.alert(
          "Share live location?",
          "Your employer has turned on Auto-Live Track. After you punch in, HireMind shares your location with your employer, even when the app is closed, for up to 12 hours or until you punch out.",
          [
            { text: "Not now", style: "cancel", onPress: () => resolve(false) },
            {
              text: "Allow",
              onPress: () => {
                AsyncStorage.setItem(CONSENT_KEY, "yes").catch(() => {});
                resolve(true);
              },
            },
          ],
          { cancelable: false },
        );
      });
  });
}

export async function startLiveTracking(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LIVE_TRACK_TASK);
    const expiry = Number((await AsyncStorage.getItem(EXPIRY_KEY)) ?? 0);
    if (running && expiry && Date.now() < expiry) return true; // already tracking
    if (running) await stopLiveTracking(); // stale session from an earlier day

    if (!(await askConsent())) return false;

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") return false;

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") {
      Alert.alert(
        "Allow location “All the time”",
        "To share your live location after punch-in, open Settings → Permissions → Location and choose “Allow all the time”.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return false;
    }

    await AsyncStorage.setItem(EXPIRY_KEY, String(Date.now() + TRACK_MS));
    await Location.startLocationUpdatesAsync(LIVE_TRACK_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 2 * 60 * 1000, // at most one point every 2 minutes
      distanceInterval: 50, // ...or when the person moves 50 m
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "HireMind is sharing your work location",
        notificationBody: "Live tracking is on until you punch out.",
        notificationColor: "#576DFA",
      },
    });
    return true;
  } catch (e) {
    console.log("[LiveTrack] could not start:", e);
    return false;
  }
}

/**
 * Call right after an employee punches in.
 * Starts tracking only if the admin turned Auto-Live Track on, and only for
 * the logged-in employee's own punch-in (not when a manager marks someone else).
 */
export async function syncLiveTrackingOnCheckIn(forEmployeeId?: number): Promise<void> {
  try {
    const cfg = await customFetch<{ enabled: boolean; employeeId: number | null }>("/api/live-track/config");
    if (!cfg?.enabled || cfg.employeeId == null) return;
    if (forEmployeeId != null && Number(forEmployeeId) !== Number(cfg.employeeId)) return;
    await startLiveTracking();
  } catch (e) {
    console.log("[LiveTrack] config check failed:", e);
  }
}