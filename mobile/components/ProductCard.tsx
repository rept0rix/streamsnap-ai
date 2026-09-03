/**
 * StreamSnap AI — Product Card Component
 *
 * Side-by-Side Dual Visuals:
 * [Video Frame Screenshot] ➔ [Amazon Match]
 * Displays:
 * 1. Full Video Name & Creator with direct TikTok Video Link
 * 2. Full Product Name (no truncation)
 * 3. Confidence % Match
 * 4. Price & Direct Amazon Buy Link
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

  const isVerified = Boolean(p.asin) && p.verified !== false;
  const targetUrl = p.url || (p.asin ? `https://www.amazon.com/dp/${p.asin}` : null);

  // Left side: what the camera/broadcast actually saw — the box_2d crop when
  // available, else the frame. Right side: the matched Amazon listing image.
  // The two are never substituted for one another; a missing image shows a
  // placeholder instead so the card can't lie about what was found.
  const frameImage: string | null =
    p.sourceCrop || p.frameImage || p.sourceFrameBase64 || null;
  const isDataUrl = (v: unknown) => typeof v === "string" && v.startsWith("data:");
  const rawProductImage: string | null = p.imageUrl || p.image || null;
  const productImageUrl =
    rawProductImage && !isDataUrl(rawProductImage) && rawProductImage !== frameImage
      ? rawProductImage
      : null;

  // Context details
  const videoTitle = p.videoTitle || (p.source?.includes("TikTok") ? "TikTok Live Video" : "Video Stream");
  const videoUrl = p.videoUrl || (videoTitle && videoTitle !== "TikTok Video" ? `https://www.tiktok.com/search?q=${encodeURIComponent(videoTitle)}` : "https://www.tiktok.com");
  const confidence: number | null =
    typeof p.confidence === "number" && Number.isFinite(p.confidence)
      ? Math.round(p.confidence <= 1 ? p.confidence * 100 : p.confidence)
      : null;
  const priceLabel = p.price ? (p.priceEstimated ? `~${p.price}` : p.price) : null;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (targetUrl) {
      Linking.openURL(targetUrl).catch(() => {});
    }
  };

  const handleOpenVideo = (e: any) => {
    e.stopPropagation();
    if (videoUrl) {
      Linking.openURL(videoUrl).catch(() => {});
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      {/* 1. Header: Full Video Name & Direct TikTok Link + Confidence % */}
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.videoSourceTag}
          onPress={handleOpenVideo}
          activeOpacity={0.7}
        >
          <Ionicons name="logo-tiktok" size={13} color="#38BDF8" style={{ marginRight: 5 }} />
          <Text style={styles.videoSourceText}>
            {videoTitle}
          </Text>
          <Ionicons name="open-outline" size={11} color="#38BDF8" style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        {confidence !== null && (
          <View style={styles.confidencePill}>
            <Ionicons name="sparkles" size={11} color="#FF7700" style={{ marginRight: 3 }} />
            <Text style={styles.confidenceText}>{confidence}% Match</Text>
          </View>
        )}
      </View>

      {/* 2. Side-by-Side Dual Thumbnails: [Video Screenshot] ➔ [Amazon Match] */}
      <View style={styles.visualsContainer}>
        {/* Left: Video Screenshot — only ever the captured frame/crop */}
        <View style={styles.visualBox}>
          {frameImage ? (
            <Image source={{ uri: frameImage }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <View style={[styles.thumbnail, styles.placeholderBox]}>
              <Ionicons name="phone-portrait-outline" size={26} color="#64748B" />
              <Text style={styles.placeholderText}>No frame saved</Text>
            </View>
          )}
          <View style={styles.thumbBadge}>
            <Ionicons name="videocam" size={10} color="#FFFFFF" style={{ marginRight: 3 }} />
            <Text style={styles.thumbBadgeText}>Video Frame</Text>
          </View>
        </View>

        {/* Center: Arrow Icon */}
        <View style={styles.arrowBox}>
          <Ionicons name="arrow-forward" size={16} color="#FF5500" />
        </View>

        {/* Right: the Amazon listing image — never the frame */}
        <View style={styles.visualBox}>
          {productImageUrl ? (
            <Image source={{ uri: productImageUrl }} style={styles.thumbnail} resizeMode="contain" />
          ) : (
            <View style={[styles.thumbnail, styles.placeholderBox]}>
              <Ionicons name={isVerified ? "cube-outline" : "search-outline"} size={26} color="#64748B" />
              <Text style={styles.placeholderText}>
                {isVerified ? "No listing photo" : "Search Amazon"}
              </Text>
            </View>
          )}
          <View style={[styles.thumbBadge, isVerified ? styles.amazonThumbBadge : styles.guessThumbBadge]}>
            <Ionicons
              name={isVerified ? "logo-amazon" : "help-circle-outline"}
              size={10}
              color="#FFFFFF"
              style={{ marginRight: 3 }}
            />
            <Text style={styles.thumbBadgeText}>{isVerified ? "Amazon Match" : "Best Guess"}</Text>
          </View>
          {isVerified && (
            <View style={styles.verifiedCheck}>
              <Ionicons name="checkmark" size={10} color="#FFFFFF" />
            </View>
          )}
        </View>
      </View>

      {/* 3. Product Info: Full Product Name (No truncation) & Pricing */}
      <View style={styles.infoBox}>
        <Text style={styles.productTitle}>
          {p.title}
        </Text>
        {isVerified && p.matchedTitle && p.matchedTitle !== p.title ? (
          <Text style={styles.matchedTitleText} numberOfLines={2}>
            {p.matchedTitle}
          </Text>
        ) : null}
        {p.matchReason ? (
          <Text style={styles.matchReasonText} numberOfLines={2}>
            💡 {p.matchReason}
          </Text>
        ) : null}

        <View style={styles.bottomRow}>
          <View style={styles.priceRow}>
            {priceLabel && (
              <View style={styles.pricePill}>
                <Text style={styles.priceText}>{priceLabel}</Text>
              </View>
            )}
            <View style={styles.amazonBadge}>
              <Ionicons name="logo-amazon" size={12} color="#FF9900" style={{ marginRight: 3 }} />
              <Text style={styles.amazonBadgeText}>{isVerified ? "Amazon" : "Amazon search"}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Text style={styles.viewLinkText}>{isVerified ? "View Deal →" : "Search →"}</Text>
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
    marginBottom: 14
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 8
  },
  videoSourceTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)"
  },
  videoSourceText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1
  },
  confidencePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 119, 0, 0.14)",
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    aspectRatio: 16 / 11,
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
    alignItems: "center",
    backgroundColor: "#0F172A",
    gap: 4
  },
  placeholderText: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "600"
  },
  thumbBadge: {
    position: "absolute",
    bottom: 5,
    left: 5,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  amazonThumbBadge: {
    backgroundColor: "rgba(255, 85, 0, 0.9)"
  },
  guessThumbBadge: {
    backgroundColor: "rgba(71, 85, 105, 0.9)"
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
    top: 5,
    right: 5,
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
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
    marginBottom: 4
  },
  matchedTitleText: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4
  },
  matchReasonText: {
    color: "#94A3B8",
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 8,
    lineHeight: 15
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
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
