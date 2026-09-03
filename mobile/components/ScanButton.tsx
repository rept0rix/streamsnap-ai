/**
 * StreamSnap AI — Scan Button Component
 *
 * The main "Snap It" CTA with animated pulse ring.
 */

import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";

interface Props {
  onPress: () => void;
  loading?: boolean;
  label?: string;
  emoji?: string;
}

export function ScanButton({ onPress, loading, label = "Snap It", emoji = "⚡" }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0, duration: 1000, useNativeDriver: true })
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.6, duration: 0, useNativeDriver: true })
        ])
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <View style={styles.wrapper}>
      {/* Pulse ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          { transform: [{ scale: pulseAnim }], opacity: opacityAnim }
        ]}
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonLoading]}
        onPress={onPress}
        activeOpacity={0.85}
        disabled={loading}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.label}>{loading ? "Scanning..." : label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", justifyContent: "center", width: 140, height: 140 },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#6366F1",
    opacity: 0.3
  },
  button: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12
  },
  buttonLoading: { backgroundColor: "#4F46E5" },
  emoji: { fontSize: 32 },
  label: { color: "#fff", fontWeight: "800", fontSize: 16, marginTop: 4 }
});
