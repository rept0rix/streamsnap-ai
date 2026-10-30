import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";
import { useNotificationStore } from "../store/useNotificationStore";
import { getSessionToken } from "../services/storage";
import { checkAppVersionGate, VersionGateResult } from "../services/api";
import { NotificationToast } from "../components/NotificationToast";
import { LogBox, Modal, View, Text, TouchableOpacity, Linking, StyleSheet } from "react-native";

LogBox.ignoreAllLogs();

export default function RootLayout() {
  const { loadSettings, loadCatalog, loadCart, setSessionToken } = useStore();
  const { loadNotifications } = useNotificationStore();
  const [updateGate, setUpdateGate] = useState<VersionGateResult | null>(null);

  useEffect(() => {
    // Bootstrap on app start
    async function init() {
      const t = await getSessionToken();
      setSessionToken(t);
      // Wait for token to be set before loading catalog to ensure cloud sync runs
      await Promise.all([loadSettings(), loadCatalog(), loadCart(), loadNotifications()]);

      // Check version gate
      const gate = await checkAppVersionGate("1.0.0");
      if (gate.blocked) {
        setUpdateGate(gate);
      }
    }
    init();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#0B0F17" />
        <NotificationToast />

        {/* Force Update Modal */}
        <Modal
          visible={Boolean(updateGate?.blocked)}
          transparent={true}
          animationType="fade"
          statusBarTranslucent={true}
        >
          <View style={modalStyles.backdrop}>
            <View style={modalStyles.card}>
              <Text style={modalStyles.icon}>⚡</Text>
              <Text style={modalStyles.title}>Update Required</Text>
              <Text style={modalStyles.message}>
                A newer version of StreamSnap AI (v{updateGate?.minVersion || "latest"}) is required to continue. Please update the app to keep scanning.
              </Text>
              <TouchableOpacity
                style={modalStyles.button}
                activeOpacity={0.8}
                onPress={() => {
                  if (updateGate?.updateUrl) {
                    Linking.openURL(updateGate.updateUrl);
                  }
                }}
              >
                <Text style={modalStyles.buttonText}>Update Now ↗</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

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
          <Stack.Screen name="history" options={{ title: "Catalog", headerShown: false }} />
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

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 15, 23, 0.94)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  card: {
    backgroundColor: "#161D2A",
    borderWidth: 1,
    borderColor: "rgba(255, 153, 0, 0.4)",
    borderRadius: 18,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10
  },
  icon: {
    fontSize: 40,
    marginBottom: 12
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FF9900",
    marginBottom: 10,
    textAlign: "center"
  },
  message: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24
  },
  button: {
    backgroundColor: "#FF9900",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    width: "100%",
    alignItems: "center"
  },
  buttonText: {
    color: "#0B0F17",
    fontWeight: "700",
    fontSize: 15
  }
});
