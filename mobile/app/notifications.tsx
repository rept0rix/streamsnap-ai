import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Linking,
  Share
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  useNotificationStore,
  type AppNotification,
  type NotificationType
} from "../store/useNotificationStore";
import { EmptyState } from "../components/EmptyState";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { notifications, markAsRead, markAllAsRead, clearAll } =
    useNotificationStore();
  const [filter, setFilter] = useState<"all" | "scans" | "updates">("all");

  const filtered = notifications.filter((item) => {
    if (filter === "scans") return item.type === "scan_find";
    if (filter === "updates") return item.type !== "scan_find";
    return true;
  });

  const formatTime = (timestamp: number) => {
    const diff = Math.max(0, Date.now() - timestamp);
    const mins = Math.floor(diff / (1000 * 60));
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const handleItemPress = (item: AppNotification) => {
    void markAsRead(item.id);
    void Haptics.selectionAsync();

    if (item.actionUrl) {
      void Linking.openURL(item.actionUrl);
    } else if (item.product?.asin) {
      router.push(`/product/${item.product.asin}` as any);
    } else if (item.product?.url) {
      void Linking.openURL(item.product.url);
    }
  };

  const handleMarkAll = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markAllAsRead();
  };

  const handleClearAll = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await clearAll();
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const isScan = item.type === "scan_find";
    return (
      <TouchableOpacity
        style={[styles.itemCard, !item.read && styles.itemCardUnread]}
        activeOpacity={0.8}
        onPress={() => handleItemPress(item)}
      >
        <View style={styles.itemIconBox}>
          {item.product?.imageUrl ? (
            <Image
              source={{ uri: item.product.imageUrl }}
              style={styles.itemThumbnail}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.itemEmoji}>
              {isScan ? "🛒" : item.type === "deal_alert" ? "🔥" : "⚡"}
            </Text>
          )}
        </View>

        <View style={styles.itemBody}>
          <View style={styles.itemTopRow}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.itemTime}>{formatTime(item.timestamp)}</Text>
          </View>
          <Text style={styles.itemDesc} numberOfLines={2}>
            {item.message}
          </Text>

          {item.product?.price && (
            <View style={styles.itemFooter}>
              <View style={styles.pricePill}>
                <Text style={styles.priceText}>{item.product.price}</Text>
              </View>
              {item.product.asin && (
                <Text style={styles.storeBadge}>Amazon Prime</Text>
              )}
            </View>
          )}
        </View>

        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Filter Tabs & Bulk Actions */}
      <View style={styles.topBar}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filter === "all" && styles.filterChipActive]}
            onPress={() => setFilter("all")}
          >
            <Text
              style={[
                styles.filterText,
                filter === "all" && styles.filterTextActive
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === "scans" && styles.filterChipActive]}
            onPress={() => setFilter("scans")}
          >
            <Text
              style={[
                styles.filterText,
                filter === "scans" && styles.filterTextActive
              ]}
            >
              🛒 Finds
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === "updates" && styles.filterChipActive]}
            onPress={() => setFilter("updates")}
          >
            <Text
              style={[
                styles.filterText,
                filter === "updates" && styles.filterTextActive
              ]}
            >
              ⚡ Updates
            </Text>
          </TouchableOpacity>
        </View>

        {notifications.length > 0 && (
          <View style={styles.actionLinks}>
            <TouchableOpacity onPress={handleMarkAll} style={styles.actionBtn}>
              <Text style={styles.actionLinkText}>Mark read</Text>
            </TouchableOpacity>
            <Text style={styles.divider}>•</Text>
            <TouchableOpacity onPress={handleClearAll} style={styles.actionBtn}>
              <Text style={[styles.actionLinkText, { color: "#F87171" }]}>
                Clear
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Notifications List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            emoji={filter === "scans" ? "📡" : "🔔"}
            title={filter === "scans" ? "No scan alerts yet" : "You're all caught up"}
            subtitle={
              filter === "scans"
                ? "Start Live Scan on the home screen to automatically detect products while browsing."
                : "New product finds, price drops, and system updates will appear here."
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0F17"
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2533"
  },
  filterRow: {
    flexDirection: "row",
    gap: 8
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#161D2B"
  },
  filterChipActive: {
    backgroundColor: "#6366F1"
  },
  filterText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600"
  },
  filterTextActive: {
    color: "#FFFFFF",
    fontWeight: "700"
  },
  actionLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  actionBtn: {
    paddingVertical: 4
  },
  actionLinkText: {
    color: "#6366F1",
    fontSize: 12,
    fontWeight: "600"
  },
  divider: {
    color: "#475569",
    fontSize: 12
  },
  listContent: {
    padding: 16,
    gap: 12
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#131A26",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E2533"
  },
  itemCardUnread: {
    borderColor: "#374151",
    backgroundColor: "#172030"
  },
  itemIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1E2533",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginRight: 12
  },
  itemThumbnail: {
    width: "100%",
    height: "100%"
  },
  itemEmoji: {
    fontSize: 22
  },
  itemBody: {
    flex: 1
  },
  itemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  itemTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    marginRight: 8
  },
  itemTime: {
    color: "#64748B",
    fontSize: 11
  },
  itemDesc: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 17
  },
  itemFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8
  },
  pricePill: {
    backgroundColor: "#059669",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  priceText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700"
  },
  storeBadge: {
    color: "#F59E0B",
    fontSize: 11,
    fontWeight: "600"
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6366F1",
    marginLeft: 8,
    marginTop: 4
  }
});
