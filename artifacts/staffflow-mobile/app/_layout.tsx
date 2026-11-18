import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import "@/services/liveTracking"; // registers the background location task

SplashScreen.preventAutoHideAsync();

const domain = process.env.EXPO_PUBLIC_DOMAIN;
console.log("API Domain:", domain);

if (domain) {
  const protocol = domain.includes("railway.app") ? "https" : "http";
  setBaseUrl(`${protocol}://${domain}`);
} else {
  setBaseUrl(`http://10.0.2.2:3000`);
}

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.message === "signal is aborted without reason" ||
      error.message === "Aborted" ||
      error.message === "The user aborted a request." ||
      error.message === "The operation was aborted.")
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      throwOnError: (err) => !isAbortLike(err),
    },
    mutations: {
      throwOnError: (err) => !isAbortLike(err),
    },
  },
});

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  usePushNotifications();
useEffect(() => {
    if (!isLoading) {
      if (user) {
        if ((user as any).role === "employee") {
          router.replace("/(employee)/");
        } else {
          router.replace("/(tabs)/");
        }
      } else {
        router.replace("/(auth)/login");
      }
    }
  }, [user, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="leaves" options={{ headerShown: true, animation: "slide_from_right", title: "Leaves" }} />
      <Stack.Screen name="salary" options={{ headerShown: true, animation: "slide_from_right", title: "Salary & Payroll" }} />
      <Stack.Screen name="payments" options={{ headerShown: true, animation: "slide_from_right", title: "Payments" }} />
      <Stack.Screen name="settings" options={{ headerShown: true, animation: "slide_from_right", title: "Settings" }} />
      <Stack.Screen name="privacy-policy" options={{ headerShown: true, title: "Privacy Policy", animation: "slide_from_right" }}/>
      <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications", animation: "slide_from_right" }} />
      <Stack.Screen name="reports" options={{ headerShown: true, title: "Company Reports", animation: "slide_from_right" }} />
      <Stack.Screen name="report-form" options={{ headerShown: true, title: "Report", animation: "slide_from_right" }} />
      <Stack.Screen name="kiosk" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="team-attendance" options={{ headerShown: true, title: "Team Attendance", animation: "slide_from_right" }} />
      <Stack.Screen name="users-permissions" options={{ headerShown: true, title: "Users & Permissions", animation: "slide_from_right" }} />
      <Stack.Screen name="team-members" options={{ headerShown: true, title: "Team", animation: "slide_from_right" }} />
      <Stack.Screen name="update-roles" options={{ headerShown: true, title: "Update Roles", animation: "slide_from_right" }} />
      <Stack.Screen name="terms" options={{ headerShown: true, title: "Terms & Conditions", animation: "slide_from_right" }} />
      <Stack.Screen name="request-feature" options={{ headerShown: true, title: "Request a Feature", animation: "slide_from_right" }} />
      <Stack.Screen name="attendance-settings" options={{ headerShown: true, title: "Attendance Settings", animation: "slide_from_right" }} />
      <Stack.Screen name="geofence-settings" options={{ headerShown: true, title: "GPS Based Geofence", animation: "slide_from_right" }} />
      <Stack.Screen name="device-requests" options={{ headerShown: true, title: "Device Verification Requests", animation: "slide_from_right" }} />
      <Stack.Screen name="custom-leaves" options={{ headerShown: true, title: "Custom Paid Leaves", animation: "slide_from_right" }} />
      <Stack.Screen name="holidays" options={{ headerShown: true, title: "Holiday List", animation: "slide_from_right" }} />
      <Stack.Screen name="live-track" options={{ headerShown: true, title: "Live Locations", animation: "slide_from_right" }} />
      <Stack.Screen name="company-settings" options={{ headerShown: true, title: "Company Settings", animation: "slide_from_right" }} />
      <Stack.Screen name="company-details" options={{ headerShown: true, title: "Company Details", animation: "slide_from_right" }} />
      <Stack.Screen name="branches" options={{ headerShown: true, title: "Branches", animation: "slide_from_right" }} />
      <Stack.Screen name="add-branch" options={{ headerShown: true, title: "Add Branch", animation: "slide_from_right" }} />
      <Stack.Screen name="departments" options={{ headerShown: true, title: "Departments", animation: "slide_from_right" }} />
      <Stack.Screen name="billing" options={{ headerShown: true, title: "Subscriptions & Billing", animation: "slide_from_right" }} />
      <Stack.Screen name="wallet-history" options={{ headerShown: true, title: "Wallet History", animation: "slide_from_right" }} />
      <Stack.Screen name="add-funds" options={{ headerShown: true, title: "Add Funds", animation: "slide_from_right" }} />
      <Stack.Screen name="upgrade-plan" options={{ headerShown: true, title: "Upgrade Plan", animation: "slide_from_right" }} />
      <Stack.Screen name="renew-plan" options={{ headerShown: true, title: "Renew Plan", animation: "slide_from_right" }} />
      <Stack.Screen name="plan-details" options={{ headerShown: true, title: "Current Plan Details", animation: "slide_from_right" }} />
      <Stack.Screen name="invoice-history" options={{ headerShown: true, title: "Invoice History", animation: "slide_from_right" }} />
      <Stack.Screen name="billing-details" options={{ headerShown: true, title: "Billing Details", animation: "slide_from_right" }} />
      <Stack.Screen name="checkout" options={{ headerShown: true, title: "Payment", animation: "slide_from_right" }} />
      <Stack.Screen name="request-leave" options={{ headerShown: true, title: "Request Leave", animation: "slide_from_right" }} />
      <Stack.Screen name="employee-holidays" options={{ headerShown: true, title: "Holiday List", animation: "slide_from_right" }} />
      <Stack.Screen name="documents" options={{ headerShown: true, title: "My Documents", animation: "slide_from_right" }} />
      <Stack.Screen name="refer-a-friend" options={{ headerShown: true, title: "Refer a Friend", animation: "slide_from_right" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafeAreaProvider>
          <ErrorBoundary>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                {(fontsLoaded || fontError) ? <RootLayoutNav /> : null}
              </KeyboardProvider>
            </GestureHandlerRootView>
          </ErrorBoundary>
        </SafeAreaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
