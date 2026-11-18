import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "hiremind_device_id";
let cachedId: string | null = null;

function makeId(): string {
  const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

/**
 * A stable ID for this app install. Used by "Device Verification" so an employee
 * can mark attendance only from the phone the admin approved.
 */
export async function getDeviceInfo(): Promise<{ deviceId: string; deviceName: string }> {
  if (!cachedId) {
    try {
      cachedId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    } catch {
      cachedId = null;
    }
    if (!cachedId) {
      cachedId = makeId();
      try {
        await SecureStore.setItemAsync(DEVICE_ID_KEY, cachedId);
      } catch {
        // SecureStore unavailable (e.g. web preview) — the in-memory id is used for this session
      }
    }
  }
  const os = Platform.OS === "android" ? "Android" : Platform.OS === "ios" ? "iOS" : "Web";
  return { deviceId: cachedId, deviceName: `${os} ${Platform.Version}` };
}

/**
 * Android flags GPS fixes coming from "mock location" apps.
 * Always returns a boolean so the server can tell new app versions from old ones.
 */
export function isMockedLocation(loc: { mocked?: boolean } | null | undefined): boolean {
  return Platform.OS === "android" ? loc?.mocked === true : false;
}