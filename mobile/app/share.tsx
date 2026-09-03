/**
 * StreamSnap AI — Share Handler Screen
 *
 * This screen is opened when the user shares an image/URL from another app
 * (TikTok, YouTube, Instagram, etc.) via the iOS Share Extension or Android
 * Share Intent.
 *
 * expo-share-intent handles the native bridge automatically.
 * We receive the shared asset, run it through /resolve, and show results.
 */

import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Platform
} from "react-native";
import { useShareIntentContext } from "expo-share-intent";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { resolve } from "../services/api";
import { compressToBase64 } from "../services/imageUtils";
import { getInstallId } from "../services/storage";
import { useStore } from "../store/useStore";
import { ProductCard } from "../components/ProductCard";
import { LoadingPulse } from "../components/LoadingPulse";
import { EmptyState } from "../components/EmptyState";
import type { Product } from "../services/api";

export default function ShareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  const { sessionToken, saveProduct, addProductToCart } = useStore();

  const [status, setStatus] = useState<"loading" | "success" | "error" | "noContent">("loading");
  const [products, setProducts] = useState<Product[]>([]);
  const [others, setOthers] = useState<Product[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  // ---------------------------------------------------------------------------
  // Process shared content on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!hasShareIntent || !shareIntent) {
      setStatus("noContent");
      return;
    }

    processShareIntent();
  }, [hasShareIntent, shareIntent]);

  async function processShareIntent() {
    try {
      setStatus("loading");

      let imageUri: string | null = null;
      let sharedUrl: string | null = null;

      // Case 1: User shared an image directly (screenshot from TikTok etc.)
      if (shareIntent.type === "media" || shareIntent.type === "file" || (shareIntent.files && shareIntent.files.length > 0)) {
        const files = shareIntent.files;
        if (files && files.length > 0) {
          imageUri = files[0].path;
        }
      } else if (shareIntent.text) {
        // Case 2: User shared a text or URL
        const text = shareIntent.text;
        // Simple regex to extract URL
        const match = text.match(/(https?:\/\/[^\s]+)/);
        if (match) {
          sharedUrl = match[1];
        }
      } else if (shareIntent.webUrl) {
        sharedUrl = shareIntent.webUrl;
      }

      if (!imageUri && !sharedUrl) {
        setStatus("noContent");
        return;
      }

      let data;
      let frameBase64: string | undefined = undefined;

      const installId = await getInstallId();

      if (imageUri) {
        const base64 = await compressToBase64(imageUri);
        frameBase64 = base64;
        const { resolve } = require("../services/api");
        data = await resolve(base64, installId, sessionToken);
      } else if (sharedUrl) {
        const { resolveUrl } = require("../services/api");
        data = await resolveUrl(sharedUrl, installId, sessionToken);
      }

      if (!data || !data.ok) throw new Error(data?.error ?? "Scan failed");

      setProducts(data.products);
      setOthers(data.others);
      setStatus("success");

      for (const p of data.products) {
        await saveProduct(p, frameBase64);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMessage(msg);
      setStatus("error");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  function handleClose() {
    resetShareIntent();
    router.dismiss();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>⚡ StreamSnap</Text>
        <TouchableOpacity onPress={handleClose}>
          <Text style={styles.closeText}>✕ Close</Text>
        </TouchableOpacity>
      </View>

      {/* States */}
      {status === "loading" && (
        <View style={styles.centered}>
          <LoadingPulse message="Finding products..." />
        </View>
      )}

      {status === "error" && (
        <View style={styles.centered}>
          <EmptyState
            emoji="⚠️"
            title="Scan failed"
            subtitle={errorMessage}
            action={{ label: "Try again", onPress: processShareIntent }}
          />
        </View>
      )}

      {status === "noContent" && (
        <View style={styles.centered}>
          <EmptyState
            emoji="📷"
            title="Share a screenshot"
            subtitle="Take a screenshot of the item you want to buy, then share it with StreamSnap AI"
          />
        </View>
      )}

      {status === "success" && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
        >
          {products.length === 0 && others.length === 0 ? (
            <EmptyState
              emoji="🔍"
              title="No products detected"
              subtitle="Try a clearer screenshot with the product fully visible"
            />
          ) : (
            <>
              {products.length > 0 && (
                <>
                  <Text style={styles.groupLabel}>
                    🛒 {products.length} Amazon product{products.length > 1 ? "s" : ""} found
                  </Text>
                  {products.map((p, i) => (
                    <ProductCard
                      key={i}
                      product={p}
                      onPress={() => p.url && Linking.openURL(p.url)}
                      onAddToCart={p.asin ? () => addProductToCart(p) : undefined}
                    />
                  ))}
                </>
              )}

              {others.length > 0 && (
                <>
                  <Text style={[styles.groupLabel, { marginTop: 24 }]}>🔗 Other results</Text>
                  {others.map((p, i) => (
                    <ProductCard
                      key={i}
                      product={p}
                      onPress={() => p.url && Linking.openURL(p.url)}
                    />
                  ))}
                </>
              )}

              <TouchableOpacity
                style={styles.viewCatalogButton}
                onPress={() => {
                  handleClose();
                  router.push("/history");
                }}
              >
                <Text style={styles.viewCatalogText}>View full catalog →</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2533"
  },
  logo: { color: "#F8FAFC", fontSize: 18, fontWeight: "800" },
  closeText: { color: "#64748B", fontSize: 14 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  groupLabel: { color: "#FF5500", fontSize: 14, fontWeight: "700", marginBottom: 12, marginTop: 20 },
  viewCatalogButton: {
    marginTop: 24,
    alignItems: "center",
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12
  },
  viewCatalogText: { color: "#FF5500", fontWeight: "600", fontSize: 14 }
});
