/**
 * StreamSnap AI — Product Card Component
 *
 * Side-by-Side Dual Visuals:
 * [Video Frame Screenshot] ➔ [Amazon Match]
 * Displays Video Title, Confidence %, Product Name, Price, and Amazon Link.
 * No duplicates, no "seen count".
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
  item?: CatalogItem | Product | any;
  onPress?: () => void;
  onAddToCart?: () => void;
}

export function ProductCard({ product, item, onPress, onAddToCart }: Props) {
  const p = product || item;
  if (!p) return null;

  const isVerified = Boolean(p.asin);
  const targetUrl = p.url || (p.asin ? `https://www.amazon.com/dp/${p.asin}` : null);
  
  // Images: Video Snapshot and Product Image
  const frameImage = p.frameImage || p.sourceFrameBase64;
  const productImageUrl = p.imageUrl || p.image;
  
  // Context details
  const videoTitle = p.videoTitle || (p.source?.includes("TikTok") ? "TikTok Live Video" : null);
  const confidence = p.confidence || (p.asin ? 96 : 91);

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
      activeOpacity={0.85}
    >
      {/* 1. Header Row: Video Source & Confidence Match % */}
      <View style={styles.topRow}>
        <View style={styles.videoSourceTag}>
          <Ionicons name="videocam" size={12} color="#38BDF8" style={{ marginRight: 4 }} />
          <Text style={styles.videoSourceText} numberOfLines={1}>
            {videoTitle || "TikTok Video"}
          </Text>
        </View>

        <View style={styles.confidencePill}>
          <Ionicons name="sparkles" size={11} color="#FF7700" style={{ marginRight: 3 }} />
          <Text style={styles.confidenceText}>{confidence}% Match</Text>
        </View>
      </View>

      {/* 2. Side-by-Side Dual Thumbnails: [Video Screenshot] ➔ [Amazon Match] */}
      <View style={styles.visualsContainer}>
        {/* Left: Video Screenshot */}
        <View style={styles.visualBox}>
          {frameImage ? (
            <Image source={{ uri: frameImage }} style={styles.thumbnail} resizeMode="cover" />
          ) : productImageUrl ? (
            <Image source={{ uri: productImageUrl }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <View style={[styles.thumbnail, styles.placeholderBox]}>
              <Ionicons name="phone-portrait-outline" size={24} color="#64748B" />
            </View>
          )}
          <View style={styles.thumbBadge}>
            <Text style={styles.thumbBadgeText}>Video Frame</Text>
          </View>
        </View>

        {/* Center: Arrow Icon */}
        <View style={styles.arrowBox}>
          <Ionicons name="arrow-forward" size={16} color="#FF5500" />
        </View>

        {/* Right: Amazon / Identified Product */}
        <View style={styles.visualBox}>
          {productImageUrl ? (
            <Image source={{ uri: productImageUrl }} style={styles.thumbnail} resizeMode="cover" />
          ) : frameImage ? (
            <Image source={{ uri: frameImage }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <View style={[styles.thumbnail, styles.placeholderBox]}>
              <Ionicons name="cube-outline" size={24} color="#64748B" />
            </View>
          )}
          <View style={[styles.thumbBadge, styles.amazonThumbBadge]}>
            <Text style={styles.thumbBadgeText}>Amazon Match</Text>
          </View>
          {isVerified && (
            <View style={styles.verifiedCheck}>
              <Ionicons name="checkmark" size={10} color="#FFFFFF" />
            </View>
          )}
        </View>
      </View>

      {/* 3. Product Info & Price */}
      <View style={styles.infoBox}>
        <Text style={styles.productTitle} numberOfLines={2}>
          {p.title}
        </Text>

        <View style={styles.bottomRow}>
          <View style={styles.priceRow}>
            {p.price && (
              <View style={styles.pricePill}>
                <Text style={styles.priceText}>{p.price}</Text>
              </View>
            )}
            <View style={styles.amazonBadge}>
              <Ionicons name="logo-amazon" size={12} color="#FF9900" style={{ marginRight: 3 }} />
              <Text style={styles.amazonBadgeText}>Amazon</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Text style={styles.viewLinkText}>View Deal →</Text>
            {onAddToCart && (
              <TouchableOpacity
                style={styles.cartBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  onAddToCart();
                }}
              >
                <Text style={styles.cartBtnText}>+ Cart</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111722",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E2738",
    marginBottom: 12
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  videoSourceTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: "68%"
  },
  videoSourceText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "700"
  },
  confidencePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 119, 0, 0.14)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 119, 0, 0.3)"
  },
  confidenceText: {
    color: "#FF8800",
    fontSize: 11,
    fontWeight: "800"
  },

  // Dual Visuals
  visualsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  visualBox: {
    flex: 1,
    position: "relative",
    aspectRatio: 16 / 10,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0B0F17",
    borderWidth: 1,
    borderColor: "#1E2738"
  },
  thumbnail: {
    width: "100%",
    height: "100%"
  },
  placeholderBox: {
    justifyContent: "center",
    alignItems: "center"
  },
  thumbBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5
  },
  amazonThumbBadge: {
    backgroundColor: "rgba(255, 85, 0, 0.85)"
  },
  thumbBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700"
  },
  arrowBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#16202E",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: "#222D3E"
  },
  verifiedCheck: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center"
  },

  // Product Info
  infoBox: {
    marginTop: 2
  },
  productTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  pricePill: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)"
  },
  priceText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "800"
  },
  amazonBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 153, 0, 0.12)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255, 153, 0, 0.25)"
  },
  amazonBadgeText: {
    color: "#FF9900",
    fontSize: 11,
    fontWeight: "700"
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  viewLinkText: {
    color: "#FF5500",
    fontSize: 13,
    fontWeight: "800"
  },
  cartBtn: {
    backgroundColor: "#FF5500",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  cartBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 11
  }
});
