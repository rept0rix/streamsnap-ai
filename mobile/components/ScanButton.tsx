/**
 * StreamSnap AI — Scan Button Component
 *
 * Electric Orange radar button with pulsating rings and vector icon.
 */

import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  onPress: () => void;
  loading?: boolean;
  label?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
}

export function ScanButton({
  onPress,
  loading,
  label = "Live Scan",
  iconName = "radio"
}: Props) {
  const pulseAnim1 = useRef(new Animated.Value(1)).current;
  const opacityAnim1 = useRef(new Animated.Value(0.7)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  const opacityAnim2 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse1 = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim1, { toValue: 1.35, duration: 1600, useNativeDriver: true }),
          Animated.timing(opacityAnim1, { toValue: 0, duration: 1600, useNativeDriver: true })
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim1, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacityAnim1, { toValue: 0.7, duration: 0, useNativeDriver: true })
        ])
      ])
    );

    const pulse2 = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.parallel([
          Animated.timing(pulseAnim2, { toValue: 1.55, duration: 1800, useNativeDriver: true }),
          Animated.timing(opacityAnim2, { toValue: 0, duration: 1800, useNativeDriver: true })
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim2, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacityAnim2, { toValue: 0.4, duration: 0, useNativeDriver: true })
        ])
      ])
    );

    pulse1.start();
    pulse2.start();
    return () => {
      pulse1.stop();
      pulse2.stop();
    };
  }, []);

  return (
    <View style={styles.wrapper}>
      {/* Outer pulse ring */}
      <Animated.View
        style={[
          styles.pulseRingOuter,
          { transform: [{ scale: pulseAnim2 }], opacity: opacityAnim2 }
        ]}
      />
      {/* Inner pulse ring */}
      <Animated.View
        style={[
          styles.pulseRingInner,
          { transform: [{ scale: pulseAnim1 }], opacity: opacityAnim1 }
        ]}
      />
      {/* Main glowing CTA button */}
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonActive]}
        onPress={onPress}
        activeOpacity={0.88}
      >
        <Ionicons
          name={loading ? "scan" : iconName}
          size={36}
          color="#FFFFFF"
          style={styles.icon}
        />
        <Text style={styles.label}>{loading ? "Scanning..." : label}</Text>
        <Text style={styles.subLabel}>{loading ? "Tap to pause" : "Auto-Capture"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: 170,
    height: 170
  },
  pulseRingOuter: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#FF5500",
    opacity: 0.25
  },
  pulseRingInner: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#FF6A00",
    opacity: 0.4
  },
  button: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "#FF5500",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF5500",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.75,
    shadowRadius: 24,
    elevation: 16,
    borderWidth: 2.5,
    borderColor: "#FFA066"
  },
  buttonActive: {
    backgroundColor: "#EA4300",
    borderColor: "#FFD0B3"
  },
  icon: {
    marginBottom: 2
  },
  label: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0.3
  },
  subLabel: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1
  }
});
