import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  Dimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useNotificationStore } from "../store/useNotificationStore";

const { width } = Dimensions.get("window");

export function NotificationToast() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeToast, dismissToast, markAsRead } = useNotificationStore();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!activeToast) return;

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 15,
        stiffness: 150
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true
      })
    ]).start();

    const timer = setTimeout(() => {
      handleDismiss();
    }, 4500);

    return () => clearTimeout(timer);
  }, [activeToast]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      })
    ]).start(() => {
      dismissToast();
    });
  };

  const handlePress = () => {
    if (!activeToast) return;
    markAsRead(activeToast.id);
    handleDismiss();
    if (activeToast.product?.asin) {
      router.push(`/product/${activeToast.product.asin}` as any);
    } else {
      router.push("/notifications" as any);
    }
  };

  if (!activeToast) return null;

  const getEmoji = () => {
    switch (activeToast.type) {
      case "scan_find":
        return "🛒";
      case "deal_alert":
        return "🔥";
      case "system_update":
        return "⚡";
      default:
        return "🔔";
    }
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: Math.max(insets.top, 12) + 6,
          transform: [{ translateY }],
          opacity
        }
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={handlePress}
      >
        <View style={styles.iconContainer}>
          {activeToast.product?.imageUrl ? (
            <Image
              source={{ uri: activeToast.product.imageUrl }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.emoji}>{getEmoji()}</Text>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              {activeToast.title}
            </Text>
            <Text style={styles.nowBadge}>NOW</Text>
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {activeToast.message}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: "center"
  },
  card: {
    width: "100%",
    maxWidth: 500,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161D2B",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2D3748",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#202B3C",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginRight: 12
  },
  productImage: {
    width: "100%",
    height: "100%"
  },
  emoji: {
    fontSize: 22
  },
  content: {
    flex: 1
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2
  },
  title: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    marginRight: 8
  },
  nowBadge: {
    color: "#FF5500",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5
  },
  message: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 16
  }
});
