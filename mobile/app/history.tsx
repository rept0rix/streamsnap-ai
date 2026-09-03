/**
 * StreamSnap AI — Product Catalog / History Screen
 *
 * Electric Orange brand design with pull-to-refresh.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useStore } from "../store/useStore";
import { ProductCard } from "../components/ProductCard";
import { EmptyState } from "../components/EmptyState";
import { clearCatalog } from "../services/storage";

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { catalog, loadCatalog } = useStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadCatalog();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await loadCatalog();
    setRefreshing(false);
  }

  async function handleClear() {
    Alert.alert(
      "Clear History?",
      "This will remove all detected products from your device. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await clearCatalog();
            await loadCatalog();
          }
        }
      ]
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Scanned History</Text>
            <Text style={styles.subTitle}>{catalog.length} detected products</Text>
          </View>
        </View>

        {catalog.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" style={{ marginRight: 4 }} />
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={catalog}
        keyExtractor={(item) => item.id || item.asin || item.url}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF5500"
            colors={["#FF5500"]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            emoji="🔍"
            title="No history yet"
            subtitle="Start Live Scan to capture items automatically from videos"
            action={{ label: "Go to Live Scan", onPress: () => router.push("/") }}
          />
        }
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            onPress={() =>
              router.push({ pathname: "/product/[id]", params: { id: item.id } })
            }
          />
        )}
      />
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
    borderBottomColor: "#141C2B",
    marginBottom: 12
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#111722",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E2738"
  },
  title: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "800"
  },
  subTitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "500"
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)"
  },
  clearButtonText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "700"
  }
});
