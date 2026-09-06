import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";
import { useNotificationStore } from "../store/useNotificationStore";
import { getSessionToken } from "../services/storage";
import { NotificationToast } from "../components/NotificationToast";

export default function RootLayout() {
  const { loadSettings, loadCatalog, loadCart, setSessionToken } = useStore();
  const { loadNotifications } = useNotificationStore();

  useEffect(() => {
    // Bootstrap on app start
    async function init() {
      const t = await getSessionToken();
      setSessionToken(t);
      // Wait for token to be set before loading catalog to ensure cloud sync runs
      await Promise.all([loadSettings(), loadCatalog(), loadCart(), loadNotifications()]);
    }
    init();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#0B0F17" />
        <NotificationToast />
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
