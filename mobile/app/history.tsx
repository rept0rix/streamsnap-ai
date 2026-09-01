/**
 * StreamSnap AI — Product Catalog / History Screen
 */

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";
import { ProductCard } from "../components/ProductCard";
import { EmptyState } from "../components/EmptyState";
import { clearCatalog } from "../services/storage";

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { catalog, loadCatalog } = useStore();

  async function handleClear() {
    Alert.alert(
      "Clear catalog?",
      "This will remove all discovered products. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
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
        <Text style={styles.title}>📦 Catalog ({catalog.length})</Text>
        {catalog.length > 0 && (
          <TouchableOpacity onPress={handleClear}>
            <Text style={styles.clearButton}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={catalog}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListEmptyComponent={
          <EmptyState
            emoji="📦"
            title="Catalog is empty"
            subtitle="Snap items from live streams to build your catalog"
            action={{ label: "Scan now", onPress: () => router.push("/scan") }}
          />
        }
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            seenCount={item.seenCount}
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
  container: { flex: 1, backgroundColor: "#0B0F17" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16
  },
  title: { color: "#F8FAFC", fontSize: 20, fontWeight: "700" },
  clearButton: { color: "#EF4444", fontSize: 14 }
});
