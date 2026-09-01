/**
 * StreamSnap AI — Product Card Component
 */

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image
} from "react-native";
import type { Product } from "../services/api";

interface Props {
  product: Product;
  seenCount?: number;
  onPress?: () => void;
  onAddToCart?: () => void;
}

export function ProductCard({ product, seenCount, onPress, onAddToCart }: Props) {
  const isVerified = Boolean(product.asin);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Thumbnail */}
      <View style={styles.imageContainer}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={{ fontSize: 28 }}>📦</Text>
          </View>
        )}
        {isVerified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {product.title}
        </Text>

        <View style={styles.metaRow}>
          {product.price && (
            <Text style={styles.price}>{product.price}</Text>
          )}
          {!isVerified && (
            <View style={styles.visualMatchBadge}>
              <Text style={styles.visualMatchText}>Visual match</Text>
            </View>
          )}
          {seenCount && seenCount > 1 && (
            <View style={styles.seenBadge}>
              <Text style={styles.seenText}>Seen {seenCount}×</Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Text style={styles.viewLink}>
            {isVerified ? "View on Amazon →" : "Search on Amazon →"}
          </Text>
          {onAddToCart && (
            <TouchableOpacity
              style={styles.cartButton}
              onPress={(e) => {
                e.stopPropagation();
                onAddToCart();
              }}
            >
              <Text style={styles.cartButtonText}>+ Cart</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#111827",
    borderRadius: 14,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1E2533"
  },
  imageContainer: { position: "relative" },
  image: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: "#1E2533"
  },
  imagePlaceholder: { justifyContent: "center", alignItems: "center" },
  verifiedBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#22C55E",
    justifyContent: "center",
    alignItems: "center"
  },
  verifiedText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  info: { flex: 1, marginLeft: 12 },
  title: { color: "#F8FAFC", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" },
  price: { color: "#FF9900", fontSize: 13, fontWeight: "700" },
  visualMatchBadge: {
    backgroundColor: "#1E2533",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  visualMatchText: { color: "#94A3B8", fontSize: 10 },
  seenBadge: {
    backgroundColor: "#312E81",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  seenText: { color: "#A5B4FC", fontSize: 10, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8
  },
  viewLink: { color: "#6366F1", fontSize: 12, fontWeight: "600" },
  cartButton: {
    backgroundColor: "#FF9900",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  cartButtonText: { color: "#000", fontWeight: "700", fontSize: 12 }
});
