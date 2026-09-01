/**
 * StreamSnap AI — Home Screen
 *
 * Hub: scan button, recent catalog, quick cart, settings nav.
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useStore } from "../store/useStore";
import { ProductCard } from "../components/ProductCard";
import { ScanButton } from "../components/ScanButton";
import { EmptyState } from "../components/EmptyState";
import { resolve } from "../services/api";
import { compressToBase64 } from "../services/imageUtils";
import { getInstallId } from "../services/storage";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    catalog,
    cart,
    scanStatus,
    lastProducts,
    setScanStatus,
    setScanResults,
    saveProduct,
    sessionToken
  } = useStore();

  // ---------------------------------------------------------------------------
  // Scan from gallery (quick scan without camera)
  // ---------------------------------------------------------------------------

  async function handlePickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to scan from your gallery.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9
    });

    if (result.canceled || !result.assets[0]) return;
    await performScan(result.assets[0].uri);
  }

  async function performScan(imageUri: string) {
    setScanStatus("scanning");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const [base64, installId] = await Promise.all([
        compressToBase64(imageUri),
        getInstallId()
      ]);

      const data = await resolve(base64, installId, sessionToken);

      if (!data.ok) throw new Error(data.error ?? "Scan failed");

      setScanResults(data.products, data.others, base64);

      // Save all Amazon products to catalog
      for (const p of data.products) {
        await saveProduct(p, base64);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to results if we found anything
      if (data.products.length > 0 || data.others.length > 0) {
        router.push("/scan");
      } else {
        Alert.alert("Nothing found", "No products were detected. Try a clearer image.");
        setScanStatus("idle");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setScanStatus("error", message);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Scan failed", message);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const recentItems = catalog.slice(0, 6);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>⚡ StreamSnap</Text>
          <Text style={styles.tagline}>Shop anything you see live</Text>
        </View>
        <View style={styles.headerActions}>
          {cart.length > 0 && (
            <TouchableOpacity style={styles.cartBadge} onPress={() => router.push("/cart")}>
              <Text style={styles.cartBadgeText}>🛒 {cart.length}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push("/settings")}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero scan section */}
        <View style={styles.heroSection}>
          <ScanButton
            onPress={() => router.push("/scan")}
            loading={scanStatus === "scanning"}
          />
          <Text style={styles.heroHint}>
            Open your camera, or pick a screenshot below
          </Text>
          <TouchableOpacity style={styles.galleryButton} onPress={handlePickImage}>
            <Text style={styles.galleryButtonText}>📷 Scan from Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* How to use */}
        <View style={styles.howToSection}>
          <Text style={styles.sectionTitle}>How to use</Text>
          <View style={styles.stepRow}>
            <View style={styles.step}>
              <Text style={styles.stepEmoji}>📱</Text>
              <Text style={styles.stepText}>See something on TikTok or YouTube</Text>
            </View>
            <View style={styles.stepArrow}><Text style={styles.stepArrowText}>→</Text></View>
            <View style={styles.step}>
              <Text style={styles.stepEmoji}>📤</Text>
              <Text style={styles.stepText}>Tap Share → StreamSnap AI</Text>
            </View>
            <View style={styles.stepArrow}><Text style={styles.stepArrowText}>→</Text></View>
            <View style={styles.step}>
              <Text style={styles.stepEmoji}>🛒</Text>
              <Text style={styles.stepText}>Get the Amazon link instantly</Text>
            </View>
          </View>
        </View>

        {/* Recent discoveries */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Finds</Text>
            {catalog.length > 6 && (
              <TouchableOpacity onPress={() => router.push("/history")}>
                <Text style={styles.seeAll}>See all ({catalog.length})</Text>
              </TouchableOpacity>
            )}
          </View>

          {recentItems.length === 0 ? (
            <EmptyState
              emoji="🔍"
              title="No finds yet"
              subtitle="Share a screenshot from TikTok or YouTube to get started"
            />
          ) : (
            recentItems.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                seenCount={item.seenCount}
                onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F17" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16
  },
  logo: { color: "#F8FAFC", fontSize: 22, fontWeight: "800" },
  tagline: { color: "#64748B", fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  cartBadge: {
    backgroundColor: "#FF9900",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  cartBadgeText: { color: "#000", fontWeight: "700", fontSize: 13 },
  settingsIcon: { fontSize: 22 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  heroSection: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 24 },
  heroHint: { color: "#64748B", fontSize: 13, marginTop: 16, textAlign: "center" },
  galleryButton: {
    marginTop: 12,
    backgroundColor: "#1E2533",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#334155"
  },
  galleryButtonText: { color: "#94A3B8", fontSize: 15, fontWeight: "600" },
  howToSection: {
    backgroundColor: "#111827",
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#1E2533"
  },
  stepRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  step: { flex: 1, alignItems: "center" },
  stepEmoji: { fontSize: 24, marginBottom: 6 },
  stepText: { color: "#94A3B8", fontSize: 11, textAlign: "center" },
  stepArrow: { paddingHorizontal: 4 },
  stepArrowText: { color: "#334155", fontSize: 18 },
  section: { paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  sectionTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "700" },
  seeAll: { color: "#6366F1", fontSize: 13 }
});
