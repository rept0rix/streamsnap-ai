/**
 * StreamSnap AI — Home Screen
 *
 * Electric Orange luxury design.
 * How it works at the top.
 * Live Scan radar hero.
 * Compact quick action buttons (Camera, Gallery, Paste Link).
 * Prominent History / Catalog section.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Image
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { useStore } from "../store/useStore";
import { ProductCard } from "../components/ProductCard";
import { ScanButton } from "../components/ScanButton";
import { EmptyState } from "../components/EmptyState";
import { resolve, resolveUrl } from "../services/api";
import { compressToBase64 } from "../services/imageUtils";
import { getInstallId } from "../services/storage";
import { useLiveScan } from "../hooks/useLiveScan";
import { useNotificationStore } from "../store/useNotificationStore";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadCount, addNotification } = useNotificationStore();
  const {
    catalog,
    cart,
    scanStatus,
    setScanStatus,
    setScanResults,
    saveProduct,
    loadCatalog,
    sessionToken
  } = useStore();
  const live = useLiveScan();
  const liveActive = live.state.broadcasting || live.state.screenCaptured;

  React.useEffect(() => {
    loadCatalog();
  }, []);

  // Paste link modal state
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Gallery Scan
  // ---------------------------------------------------------------------------
  async function handlePickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to scan from your gallery.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85
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

      for (const p of data.products) {
        await saveProduct(p, base64);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (data.products.length > 0 || data.others.length > 0) {
        router.push("/scan");
      } else {
        Alert.alert("No products detected", "Try taking a clearer shot or scan live while video plays.");
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
  // Paste Video Link Resolution
  // ---------------------------------------------------------------------------
  async function handleResolveVideoLink() {
    const trimmed = videoUrl.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
      Alert.alert("Invalid Link", "Please paste a valid TikTok, Instagram Reels, or YouTube URL.");
      return;
    }

    setUrlLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const installId = await getInstallId();
      const res = await resolveUrl(trimmed, installId, sessionToken);

      if (!res.ok) throw new Error(res.error || "Could not extract products from link.");

      for (const p of res.products || []) {
        await saveProduct(p);
      }

      await addNotification({
        type: "scan_find",
        title: "Video Link Scanned!",
        message: res.products?.[0]?.title
          ? `Found: ${res.products[0].title}`
          : "Products extracted from video link.",
        product: res.products?.[0]
      });

      setLinkModalVisible(false);
      setVideoUrl("");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if ((res.products?.length || 0) > 0 || (res.others?.length || 0) > 0) {
        setScanResults(res.products, res.others);
        router.push("/scan");
      } else {
        Alert.alert("No Products Found", "We scanned the video frame but could not detect shoppable items.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      Alert.alert("Extraction Failed", message);
    } finally {
      setUrlLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const recentItems = catalog.slice(0, 12);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ⚡ Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandIconWrapper}>
            <Ionicons name="flash" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.logo}>StreamSnap</Text>
            <Text style={styles.tagline}>Auto-Scan Live Video</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push("/notifications" as any)}
          >
            <Ionicons name="notifications-outline" size={22} color="#CBD5E1" />
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {cart.length > 0 && (
            <TouchableOpacity style={styles.cartBadge} onPress={() => router.push("/cart")}>
              <Ionicons name="cart-outline" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.cartBadgeText}>{cart.length}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push("/settings")}
          >
            <Ionicons name="settings-outline" size={22} color="#CBD5E1" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 🔴 Shazam-Style Dynamic Radar Island / Live Activity Header */}
      {liveActive ? (
        <View style={styles.liveRadarBanner}>
          <View style={styles.liveRadarLeft}>
            <View style={styles.liveRadarPulseContainer}>
              <View style={styles.liveRadarPulseRing} />
              <View style={styles.liveRadarPulseDot} />
            </View>
            <View style={styles.liveRadarInfo}>
              <View style={styles.liveRadarTitleRow}>
                <Text style={styles.liveRadarTitle}>STREAMSNAP RADAR ACTIVE</Text>
                <View style={styles.liveFpsBadge}>
                  <Text style={styles.liveFpsText}>60 FPS</Text>
                </View>
              </View>
              <Text style={styles.liveRadarSub} numberOfLines={1}>
                {live.state.scanCount > 0
                  ? `Pause a video to scan it · ${live.state.scanCount} frames analyzed`
                  : "Pause on any product to scan it instantly..."}
              </Text>
            </View>
          </View>

          {/* Dynamic Audio/Video Equalizer Waves */}
          <View style={styles.liveWaveBox}>
            <View style={[styles.liveWaveBar, { height: 14 }]} />
            <View style={[styles.liveWaveBar, { height: 22 }]} />
            <View style={[styles.liveWaveBar, { height: 11 }]} />
            <View style={[styles.liveWaveBar, { height: 18 }]} />
          </View>
        </View>
      ) : (
        <View style={styles.idleRadarBanner}>
          <View style={styles.idleRadarLeft}>
            <Ionicons name="radio" size={14} color="#FF6A00" style={{ marginRight: 6 }} />
            <Text style={styles.idleRadarText}>Video Screen Scanner Ready</Text>
          </View>
          <Text style={styles.idleRadarSub}>Tap Radar Below</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. 📖 How It Works Deck (TOP OF PAGE) */}
        <View style={styles.howToCard}>
          <View style={styles.howToHeader}>
            <Ionicons name="bulb-outline" size={16} color="#FF7700" />
            <Text style={styles.howToTitle}>HOW LIVE SCAN WORKS</Text>
          </View>

          <View style={styles.stepGrid}>
            <View style={styles.stepItem}>
              <View style={styles.stepNumBadge}><Text style={styles.stepNumText}>1</Text></View>
              <Ionicons name="radio-outline" size={20} color="#FF6A00" style={styles.stepIcon} />
              <Text style={styles.stepBold}>Start Live Scan</Text>
              <Text style={styles.stepSub}>Tap the radar below</Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color="#334155" style={styles.stepArrow} />

            <View style={styles.stepItem}>
              <View style={styles.stepNumBadge}><Text style={styles.stepNumText}>2</Text></View>
              <Ionicons name="phone-portrait-outline" size={20} color="#FF6A00" style={styles.stepIcon} />
              <Text style={styles.stepBold}>Browse Video</Text>
              <Text style={styles.stepSub}>TikTok, Reels, YT</Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color="#334155" style={styles.stepArrow} />

            <View style={styles.stepItem}>
              <View style={styles.stepNumBadge}><Text style={styles.stepNumText}>3</Text></View>
              <Ionicons name="cart-outline" size={20} color="#10B981" style={styles.stepIcon} />
              <Text style={styles.stepBold}>Instant Finds</Text>
              <Text style={styles.stepSub}>Amazon alerts drop</Text>
            </View>
          </View>
        </View>

        {/* 2. 📡 Live Scan Hero Section */}
        <View style={styles.heroSection}>
          <ScanButton
            onPress={async () => {
              try {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                await live.start();
              } catch (err) {
                const message = err instanceof Error ? err.message : "Could not start live scan";
                Alert.alert("Live scan", message);
              }
            }}
            loading={liveActive}
            label={liveActive ? "Scanning" : "Live Scan"}
            iconName="radio"
          />

          <View style={styles.liveStatusBox}>
            <View style={[styles.statusDot, liveActive && styles.statusDotActive]} />
            <Text style={styles.heroHint}>
              {liveActive
                ? `${live.state.scanCount} frames · ${live.state.findCount} items found`
                : "Continuous screen scanning · Saves items automatically"}
            </Text>
          </View>

          {live.state.lastError ? (
            <Text style={styles.liveError}>{live.state.lastError}</Text>
          ) : null}

          {/* 3. 🛠 Compact Quick Action Bar */}
          <View style={styles.quickBar}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => router.push("/scan")}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={18} color="#FFA066" />
              <Text style={styles.quickBtnText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickBtn}
              onPress={handlePickImage}
              activeOpacity={0.8}
            >
              <Ionicons name="image-outline" size={18} color="#FFA066" />
              <Text style={styles.quickBtnText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickBtn, styles.quickBtnHighlight]}
              onPress={() => setLinkModalVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="link-outline" size={18} color="#FF6A00" />
              <Text style={[styles.quickBtnText, { color: "#FF8800", fontWeight: "700" }]}>
                Paste Link
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. 🗂 Prominent History & Catalog Section */}
        <View style={styles.catalogSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="time-outline" size={20} color="#FF7700" style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>Detected Products</Text>
              {catalog.length > 0 && (
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{catalog.length}</Text>
                </View>
              )}
            </View>

            {catalog.length > 0 && (
              <TouchableOpacity onPress={() => router.push("/history")}>
                <Text style={styles.seeAll}>View All →</Text>
              </TouchableOpacity>
            )}
          </View>

          {recentItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="scan-outline" size={32} color="#64748B" />
              </View>
              <Text style={styles.emptyTitle}>No products scanned yet</Text>
              <Text style={styles.emptyDesc}>
                Tap Live Scan above, then open TikTok or YouTube. Pause on anything you like — that frame is scanned instantly and lands right here.
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => setLinkModalVisible(true)}
              >
                <Ionicons name="link" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionText}>Try Pasting a Video Link</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.productsGrid}>
              {recentItems.map((item) => (
                <ProductCard key={item.id || item.asin || item.url} item={item} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 🔗 Paste Video Link Modal */}
      <Modal
        visible={linkModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLinkModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="link" size={20} color="#FF6A00" style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Paste Video Link</Text>
              </View>
              <TouchableOpacity onPress={() => setLinkModalVisible(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Paste a link from TikTok, Instagram Reels, or YouTube to identify items featured in the video.
            </Text>

            <TextInput
              style={styles.urlInput}
              placeholder="https://www.tiktok.com/@user/video/..."
              placeholderTextColor="#475569"
              value={videoUrl}
              onChangeText={setVideoUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <TouchableOpacity
              style={[styles.resolveBtn, urlLoading && styles.resolveBtnDisabled]}
              onPress={handleResolveVideoLink}
              disabled={urlLoading}
            >
              {urlLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.resolveBtnText}>Scan Video for Products</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080C14"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#141C2B"
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  brandIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FF5500",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF5500",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8
  },
  logo: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.4
  },
  tagline: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "500"
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#111722",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E2738"
  },
  unreadBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#FF5500",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#080C14"
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800"
  },
  cartBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF6A00",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  cartBadgeText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: 40
  },

  // 1. How It Works (Top)
  howToCard: {
    backgroundColor: "#0F1622",
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1C2536"
  },
  howToHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12
  },
  howToTitle: {
    color: "#FF8800",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8
  },
  stepGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  stepItem: {
    flex: 1,
    alignItems: "center"
  },
  stepNumBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#1C2536",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4
  },
  stepNumText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700"
  },
  stepIcon: {
    marginBottom: 4
  },
  stepBold: {
    color: "#F1F5F9",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  stepSub: {
    color: "#64748B",
    fontSize: 10,
    textAlign: "center",
    marginTop: 2
  },
  stepArrow: {
    opacity: 0.6
  },

  // 2. Hero Section
  heroSection: {
    alignItems: "center",
    paddingVertical: 26,
    paddingHorizontal: 20
  },
  liveStatusBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    backgroundColor: "#111722",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1C2638"
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#64748B",
    marginRight: 8
  },
  statusDotActive: {
    backgroundColor: "#10B981"
  },
  heroHint: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600"
  },
  liveError: {
    color: "#F87171",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center"
  },

  // 3. Compact Quick Action Bar
  quickBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    width: "100%",
    justifyContent: "center"
  },
  quickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111722",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#202A3C"
  },
  quickBtnHighlight: {
    backgroundColor: "rgba(255, 106, 0, 0.12)",
    borderColor: "rgba(255, 106, 0, 0.4)"
  },
  quickBtnText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600"
  },

  // 4. Catalog & History
  catalogSection: {
    paddingHorizontal: 16,
    marginTop: 10
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "800"
  },
  countPill: {
    backgroundColor: "rgba(255, 85, 0, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 85, 0, 0.3)"
  },
  countPillText: {
    color: "#FF8800",
    fontSize: 11,
    fontWeight: "800"
  },
  seeAll: {
    color: "#FF6A00",
    fontSize: 13,
    fontWeight: "700"
  },
  productsGrid: {
    gap: 12
  },
  emptyCard: {
    backgroundColor: "#0F1622",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1C2536",
    borderStyle: "dashed"
  },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#161F2E",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12
  },
  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700"
  },
  emptyDesc: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 16
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    backgroundColor: "#FF5500",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12
  },
  emptyActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700"
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  modalCard: {
    backgroundColor: "#111722",
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: "#222D3E"
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  modalTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "800"
  },
  modalSub: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16
  },
  urlInput: {
    backgroundColor: "#080C14",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#F8FAFC",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#202A3C",
    marginBottom: 18
  },
  resolveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5500",
    paddingVertical: 14,
    borderRadius: 14
  },
  resolveBtnDisabled: {
    opacity: 0.6
  },
  resolveBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  },

  // 🔴 Shazam-Style Dynamic Radar Island Header
  liveRadarBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(255, 85, 0, 0.12)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255, 106, 0, 0.5)"
  },
  liveRadarLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1
  },
  liveRadarPulseContainer: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10
  },
  liveRadarPulseRing: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255, 85, 0, 0.35)"
  },
  liveRadarPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF5500"
  },
  liveRadarInfo: {
    flex: 1
  },
  liveRadarTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  liveRadarTitle: {
    color: "#FF6A00",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4
  },
  liveFpsBadge: {
    backgroundColor: "#FF5500",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5
  },
  liveFpsText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900"
  },
  liveRadarSub: {
    color: "#CBD5E1",
    fontSize: 11,
    marginTop: 2
  },
  liveWaveBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 24,
    paddingLeft: 6
  },
  liveWaveBar: {
    width: 3,
    backgroundColor: "#FF6A00",
    borderRadius: 2
  },

  idleRadarBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#111722",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#1E2738"
  },
  idleRadarLeft: {
    flexDirection: "row",
    alignItems: "center"
  },
  idleRadarText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700"
  },
  idleRadarSub: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600"
  }
});
