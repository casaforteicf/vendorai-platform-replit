import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : "https://appvendorai.com");

setBaseUrl(apiBaseUrl);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootLayoutNav() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const firstSegment = segments[0];
    const isLoginRoute = firstSegment === "login";

    if (!token) {
      if (!isLoginRoute) router.replace("/login");
      return;
    }

    // Preserve deep links such as vendorai://jarvis?wake=1. Only leave the
    // login screen automatically after a valid persisted session is loaded.
    if (isLoginRoute) router.replace("/(tabs)");
  }, [token, isLoading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" options={{ animation: "fade" }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="jarvis" options={{ headerShown: false }} />
      <Stack.Screen
        name="leads/[id]"
        options={{
          headerShown: true,
          headerTitle: "Detalhe do Lead",
          headerBackTitle: "Leads",
          headerStyle: { backgroundColor: "transparent" },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="conversations/[id]"
        options={{
          headerShown: true,
          headerTitle: "Conversa",
          headerBackTitle: "Conversas",
          presentation: "card",
        }}
      />
      <Stack.Screen name="ads/index" options={{ headerShown: false, presentation: "card" }} />
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

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
