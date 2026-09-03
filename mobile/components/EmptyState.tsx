/**
 * StreamSnap AI — Empty State Component
 */

import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

interface Props {
  emoji: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ emoji, title, subtitle, action }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {action && (
        <TouchableOpacity style={styles.button} onPress={action.onPress}>
          <Text style={styles.buttonText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { color: "#F8FAFC", fontSize: 18, fontWeight: "700", textAlign: "center" },
  subtitle: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22
  },
  button: {
    marginTop: 20,
    backgroundColor: "#FF5500",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12
  },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 }
});
