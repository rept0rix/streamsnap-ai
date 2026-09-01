/**
 * StreamSnap AI — Camera Scan Screen + Results
 *
 * Handles live camera scanning and shows product results.
 */

import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";
import { ProductCard } from "../components/ProductCard";
import { LoadingPulse } from "../components/LoadingPulse";
import { EmptyState } from "../components/EmptyState";
import { resolve } from "../services/api";
import { compressToBase64 } from "../services/imageUtils";
import { getInstallId } from "../services/storage";

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const {
    scanStatus,
    scanError,
    lastProducts,
    lastOthers,
    setScanStatus,
    setScanResults,
    saveProduct,
    addProductToCart,
    sessionToken
  } = useStore();

  const hasResults = lastProducts.length > 0 || lastOthers.length > 0;
  const [mode, setMode] = useState<"camera" | "results">(hasResults ? "results" : "camera");

  // ---------------------------------------------------------------------------
  // Camera capture
  // ---------------------------------------------------------------------------

  async function handleSnap() {
    if (!cameraRef.current) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) throw new Error("No photo captured");

      setScanStatus("scanning");
      const [base64, installId] = await Promise.all([
        compressToBase64(photo.uri),
        getInstallId()
      ]);

      const data = await resolve(base64, installId, sessionToken);
      if (!data.ok) throw new Error(data.error ?? "Scan failed");

      setScanResults(data.products, data.others, base64);

      for (const p of data.products) {
        await saveProduct(p, base64);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMode("results");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setScanStatus("error", message);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Scan failed", message);
    }
  }

  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSubtitle}>
          StreamSnap needs your camera to scan items from live streams.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Results view
  // ---------------------------------------------------------------------------

  if (mode === "results" || hasResults) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.resultsHeader}>
          <TouchableOpacity onPress={() => setMode("camera")}>
            <Text style={styles.backButton}>← Scan Again</Text>
          </TouchableOpacity>
          <Text style={styles.resultsTitle}>
            {lastProducts.length > 0
              ? `${lastProducts.length} product${lastProducts.length > 1 ? "s" : ""} found`
              : "No Amazon products found"}
          </Text>
          <TouchableOpacity onPress={() => router.dismiss()}>
            <Text style={styles.doneButton}>Done</Text>
          </TouchableOpacity>
        </View>

        {scanStatus === "scanning" ? (
          <LoadingPulse message="Scanning..." />
        ) : lastProducts.length === 0 && lastOthers.length === 0 ? (
          <EmptyState
            emoji="🔍"
            title="Nothing detected"
            subtitle="Try a clearer photo with the product clearly visible"
          />
        ) : (
          <ScrollView
            style={styles.resultsList}
            contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
          >
            {lastProducts.length > 0 && (
              <>
                <Text style={styles.groupLabel}>🛒 Amazon Products</Text>
                {lastProducts.map((p, i) => (
                  <ProductCard
                    key={i}
                    product={p}
                    onPress={() => p.url && Linking.openURL(p.url)}
                    onAddToCart={p.asin ? () => addProductToCart(p) : undefined}
                  />
                ))}
              </>
            )}
            {lastOthers.length > 0 && (
              <>
                <Text style={[styles.groupLabel, { marginTop: 24 }]}>🔗 Other results</Text>
                {lastOthers.map((p, i) => (
                  <ProductCard
                    key={i}
                    product={p}
                    onPress={() => p.url && Linking.openURL(p.url)}
                  />
                ))}
              </>
            )}
          </ScrollView>
        )}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Camera view
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Overlay */}
        <View style={[styles.cameraOverlay, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.dismiss()} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Center guide */}
        <View style={styles.centerGuide}>
          <View style={styles.focusBox} />
          <Text style={styles.cameraHint}>Point at any item on screen</Text>
        </View>

        {/* Snap button */}
        <View style={[styles.cameraControls, { paddingBottom: insets.bottom + 32 }]}>
          {scanStatus === "scanning" ? (
            <LoadingPulse message="Identifying..." dark={false} />
          ) : (
            <TouchableOpacity
              style={styles.snapButton}
              onPress={handleSnap}
              activeOpacity={0.8}
            >
              <View style={styles.snapButtonInner} />
            </TouchableOpacity>
          )}
        </View>
      </CameraView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F17" },
  centered: { justifyContent: "center", alignItems: "center", padding: 32 },
  camera: { flex: 1 },
  cameraOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 16
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center"
  },
  closeButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  centerGuide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  focusBox: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: "rgba(99,102,241,0.8)",
    borderRadius: 16
  },
  cameraHint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 16,
    textAlign: "center"
  },
  cameraControls: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 32
  },
  snapButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center"
  },
  snapButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff"
  },
  permTitle: { color: "#F8FAFC", fontSize: 20, fontWeight: "700", textAlign: "center" },
  permSubtitle: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 32,
    lineHeight: 22
  },
  primaryButton: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2533"
  },
  backButton: { color: "#6366F1", fontSize: 14 },
  resultsTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  doneButton: { color: "#6366F1", fontSize: 14, fontWeight: "600" },
  resultsList: { flex: 1 },
  groupLabel: { color: "#94A3B8", fontSize: 13, fontWeight: "600", marginBottom: 12, marginTop: 16 }
});
