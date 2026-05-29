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

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

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
      <Stack.Screen name="kiosk" options={{ headerShown: false, animation: "slide_from_right" }} />
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
