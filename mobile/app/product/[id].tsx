/**
 * StreamSnap AI — Product Detail Screen
 */

import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Linking
} from "react-native";
import { useLocalSearchParams, useRouter } from "react-native-router-flux"; // Actually Expo router uses this under the hood, but let's use expo-router
import { useLocalSearchParams as useExpoParams, useRouter as useExpoRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../store/useStore";
import type { CatalogItem } from "../../services/storage";

export default function ProductScreen() {
  const { id } = useExpoParams<{ id: string }>();
  const router = useExpoRouter();
  const insets = useSafeAreaInsets();
  const { catalog, addProductToCart } = useStore();

  const [product, setProduct] = useState<CatalogItem | null>(null);

  useEffect(() => {
    const found = catalog.find((c) => c.id === id);
    if (found) setProduct(found);
  }, [id, catalog]);

  if (!product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Product not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isVerified = Boolean(product.asin);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Product Image */}
      <View style={styles.imageHeader}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.mainImage} resizeMode="contain" />
        ) : (
          <View style={[styles.mainImage, styles.placeholder]}>
            <Text style={{ fontSize: 64 }}>📦</Text>
          </View>
        )}
      </View>

      <View style={styles.details}>
        {isVerified ? (
          <View style={styles.verifiedTag}>
            <Text style={styles.verifiedText}>✓ Verified Match</Text>
          </View>
        ) : (
          <View style={styles.visualTag}>
            <Text style={styles.visualText}>👁️ Visual Match</Text>
          </View>
        )}

        <Text style={styles.title}>{product.title}</Text>
        {product.price && <Text style={styles.price}>{product.price}</Text>}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => product.url && Linking.openURL(product.url)}
          >
            <Text style={styles.primaryButtonText}>
              {isVerified ? "View on Amazon" : "Search on Amazon"}
            </Text>
          </TouchableOpacity>

          {isVerified && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => addProductToCart(product)}
            >
              <Text style={styles.secondaryButtonText}>Add to Cart</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Source Frame (Traceability) */}
      {product.sourceFrameBase64 && (
        <View style={styles.sourceSection}>
          <Text style={styles.sectionTitle}>Source Frame</Text>
          <Text style={styles.sectionSubtitle}>
            This is the image snippet that StreamSnap used to identify the product.
          </Text>
          <Image
            source={{ uri: product.sourceFrameBase64 }}
            style={styles.sourceImage}
            resizeMode="contain"
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F17" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0B0F17" },
  errorText: { color: "#F8FAFC", fontSize: 18, marginBottom: 12 },
  backLink: { color: "#6366F1", fontSize: 16 },
  imageHeader: {
    backgroundColor: "#fff",
    width: "100%",
    height: 300,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2533"
  },
  mainImage: { width: "100%", height: "100%" },
  placeholder: { justifyContent: "center", alignItems: "center", backgroundColor: "#1E2533" },
  details: { padding: 20 },
  verifiedTag: {
    alignSelf: "flex-start",
    backgroundColor: "#22C55E20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12
  },
  verifiedText: { color: "#4ADE80", fontSize: 12, fontWeight: "700" },
  visualTag: {
    alignSelf: "flex-start",
    backgroundColor: "#334155",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12
  },
  visualText: { color: "#CBD5E1", fontSize: 12, fontWeight: "600" },
  title: { color: "#F8FAFC", fontSize: 20, fontWeight: "700", lineHeight: 28 },
  price: { color: "#FF9900", fontSize: 22, fontWeight: "800", marginTop: 12 },
  actions: { marginTop: 24, gap: 12 },
  primaryButton: {
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    backgroundColor: "#FF9900",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },
  secondaryButtonText: { color: "#000", fontSize: 16, fontWeight: "700" },
  sourceSection: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#1E2533",
    marginTop: 8
  },
  sectionTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "700" },
  sectionSubtitle: { color: "#94A3B8", fontSize: 13, marginTop: 4, marginBottom: 16, lineHeight: 18 },
  sourceImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1E2533"
  }
});
