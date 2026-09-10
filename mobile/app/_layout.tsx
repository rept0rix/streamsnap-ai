import { useEffect, type ReactNode } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { useStore } from "../store/useStore";
import { useNotificationStore } from "../store/useNotificationStore";
import { getSessionToken } from "../services/storage";
import { NotificationToast } from "../components/NotificationToast";
import { isExpoGo } from "../lib/expoGo";

function ShareIntentRedirect() {
  const router = useRouter();
  const segments = useSegments();
  const { hasShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (hasShareIntent && segments[0] !== "share") {
      router.push("/share");
    }
  }, [hasShareIntent, segments, router]);

  return null;
}

function AppTree({ children }: { children?: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#0B0F17" />
        <NotificationToast />
        {children}
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#0B0F17" },
            headerTintColor: "#F8FAFC",
            headerTitleStyle: { fontWeight: "700" },
            contentStyle: { backgroundColor: "#0B0F17" },
            animation: "slide_from_right"
          }}
        >
          <Stack.Screen name="index" options={{ title: "StreamSnap AI", headerShown: false }} />
          <Stack.Screen name="scan" options={{ title: "Snap It", presentation: "modal" }} />
          <Stack.Screen name="history" options={{ title: "Catalog" }} />
          <Stack.Screen name="cart" options={{ title: "Cart" }} />
          <Stack.Screen name="notifications" options={{ title: "Updates & Alerts" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="share" options={{ title: "StreamSnap", presentation: "modal" }} />
          <Stack.Screen
            name="product/[id]"
            options={{ title: "Product", presentation: "card" }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const { loadSettings, loadCatalog, loadCart, setSessionToken } = useStore();
  const { loadNotifications } = useNotificationStore();

  useEffect(() => {
    async function init() {
      const t = await getSessionToken();
      setSessionToken(t);
      await Promise.all([loadSettings(), loadCatalog(), loadCart(), loadNotifications()]);
    }
    init();
  }, []);

  // expo-share-intent has no native module inside Expo Go.
  if (isExpoGo) {
    return <AppTree />;
  }

  return (
    <ShareIntentProvider options={{ resetOnBackground: false }}>
      <AppTree>
        <ShareIntentRedirect />
      </AppTree>
    </ShareIntentProvider>
  );
}
