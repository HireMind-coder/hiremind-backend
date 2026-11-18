import { useEffect, useRef } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { NOTIF_KEY, getNotifications, registerForPush } from "@/services/pushNotifications";

export function usePushNotifications() {
  const { user } = useAuth();
  const userId = user?.id;
  const handledId = useRef<string | null>(null);

  // Register this phone after login (only if the user has notifications on)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const pref = await AsyncStorage.getItem(NOTIF_KEY);
      if (pref === "false" || cancelled) return;
      await registerForPush(); // does nothing in Expo Go
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Open the right screen when a notification is tapped
  useEffect(() => {
    const Notifications = getNotifications();
    if (!userId || !Notifications) return;

    const open = (response: import("expo-notifications").NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledId.current === id) return;
      handledId.current = id;

      const screen = response.notification.request.content.data?.screen;
      if (typeof screen === "string" && screen.startsWith("/")) {
        // wait for the home redirect in RootLayoutNav to finish first
        setTimeout(() => router.push(screen as any), 600);
      }
    };

    Notifications.getLastNotificationResponseAsync().then(open); // app opened from a closed state
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [userId]);
}