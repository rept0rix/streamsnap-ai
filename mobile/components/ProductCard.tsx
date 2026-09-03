/**
 * StreamSnap AI — Product Card Component
 *
 * Electric Orange brand palette, auto-link opening, Amazon badges.
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Product } from "../services/api";
import type { CatalogItem } from "../services/storage";

interface Props {
  product?: Product;
  item?: CatalogItem | Product;
  seenCount?: number;
  onPress?: () => void;
  onAddToCart?: () => void;
}

export function ProductCard({ product, item, seenCount, onPress, onAddToCart }: Props) {
  const p = product || item;
  if (!p) return null;

  const isVerified = Boolean(p.asin);
  const imageUrl = p.imageUrl || (p as any).image;
  const count = seenCount || (p as any).seenCount;
  const targetUrl = p.url || (p.asin ? `https://www.amazon.com/dp/${p.asin}` : null);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (targetUrl) {
      Linking.openURL(targetUrl).catch(() => {});
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {/* Thumbnail */}
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="cube-outline" size={28} color="#64748B" />
          </View>
        )}
        {isVerified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {p.title}
        </Text>

        <View style={styles.metaRow}>
          {p.price && (
            <View style={styles.pricePill}>
              <Text style={styles.price}>{p.price}</Text>
            </View>
          )}

          {isVerified ? (
            <View style={styles.amazonPill}>
              <Ionicons name="logo-amazon" size={11} color="#FF9900" style={{ marginRight: 3 }} />
              <Text style={styles.amazonPillText}>Amazon</Text>
            </View>
          ) : (
            <View style={styles.visualMatchBadge}>
              <Text style={styles.visualMatchText}>Visual match</Text>
            </View>
          )}

          {count && count > 1 ? (
            <View style={styles.seenBadge}>
              <Text style={styles.seenText}>Seen {count}×</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Text style={styles.viewLink}>
            {isVerified ? "View on Amazon →" : "Find on Amazon →"}
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
    backgroundColor: "#111722",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1E2738"
  },
  imageContainer: {
    position: "relative"
  },
  image: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#182232"
  },
  imagePlaceholder: {
    justifyContent: "center",
    alignItems: "center"
  },
  verifiedBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#111722"
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "space-between"
  },
  title: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginVertical: 4,
    alignItems: "center"
  },
  pricePill: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)"
  },
  price: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "800"
  },
  amazonPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 153, 0, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 153, 0, 0.3)"
  },
  amazonPillText: {
    color: "#FF9900",
    fontSize: 10,
    fontWeight: "700"
  },
  visualMatchBadge: {
    backgroundColor: "#1A2332",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  visualMatchText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "500"
  },
  seenBadge: {
    backgroundColor: "rgba(255, 85, 0, 0.15)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255, 85, 0, 0.3)"
  },
  seenText: {
    color: "#FF8800",
    fontSize: 10,
    fontWeight: "700"
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2
  },
  viewLink: {
    color: "#FF6A00",
    fontSize: 12,
    fontWeight: "700"
  },
  cartButton: {
    backgroundColor: "#FF5500",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  cartButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 11
  }
});
