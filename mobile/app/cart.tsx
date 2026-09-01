/**
 * StreamSnap AI — Cart Screen
 */

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Linking,
  Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";
import { EmptyState } from "../components/EmptyState";
import { useRouter } from "expo-router";

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cart, removeProductFromCart, getCartUrl, settings } = useStore();

  async function handleCheckout() {
    const url = await getCartUrl();
    await Linking.openURL(url);
  }

  async function handleRemove(asin: string) {
    await removeProductFromCart(asin);
  }

  const total = cart.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>🛒 Cart ({total})</Text>
      </View>

      <FlatList
        data={cart}
        keyExtractor={(item) => item.asin}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <EmptyState
            emoji="🛒"
            title="Cart is empty"
            subtitle="Add products from your scan results"
            action={{ label: "Scan now", onPress: () => router.push("/scan") }}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
            ) : (
              <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                <Text style={{ fontSize: 24 }}>📦</Text>
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.price && <Text style={styles.itemPrice}>{item.price}</Text>}
              <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleRemove(item.asin)}
              style={styles.removeButton}
            >
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {cart.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.footerTag}>
            Tag: {settings?.affiliateTag ?? "streamsnap03-20"}
          </Text>
          <TouchableOpacity style={styles.checkoutButton} onPress={handleCheckout}>
            <Text style={styles.checkoutText}>
              Checkout on Amazon ({total} item{total > 1 ? "s" : ""}) →
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F17" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2533"
  },
  title: { color: "#F8FAFC", fontSize: 20, fontWeight: "700" },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#1E2533"
  },
  itemImage: { width: 60, height: 60, borderRadius: 8, backgroundColor: "#1E2533" },
  itemImagePlaceholder: { justifyContent: "center", alignItems: "center" },
  itemInfo: { flex: 1, paddingHorizontal: 12 },
  itemTitle: { color: "#F8FAFC", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  itemPrice: { color: "#FF9900", fontSize: 13, marginTop: 4 },
  itemQty: { color: "#64748B", fontSize: 12, marginTop: 2 },
  removeButton: { padding: 8 },
  removeText: { color: "#64748B", fontSize: 18 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111827",
    borderTopWidth: 1,
    borderTopColor: "#1E2533",
    padding: 16
  },
  footerTag: { color: "#64748B", fontSize: 11, marginBottom: 10, textAlign: "center" },
  checkoutButton: {
    backgroundColor: "#FF9900",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  checkoutText: { color: "#000", fontWeight: "800", fontSize: 15 }
});
