/**
 * StreamSnap AI — Settings Screen
 */

import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, patchSettings, sessionToken } = useStore();

  const [affiliateTag, setAffiliateTag] = useState(
    settings?.affiliateTag ?? "streamsnap03-20"
  );
  const [minConfidence, setMinConfidence] = useState(
    String(settings?.minConfidence ?? 50)
  );

  async function handleSave() {
    const confidence = parseInt(minConfidence, 10);
    if (isNaN(confidence) || confidence < 0 || confidence > 100) {
      Alert.alert("Invalid confidence", "Enter a number between 0 and 100.");
      return;
    }
    if (affiliateTag && !/^[A-Za-z0-9_-]{3,25}$/.test(affiliateTag)) {
      Alert.alert("Invalid tag", "Affiliate tag must be 3–25 alphanumeric characters.");
      return;
    }
    await patchSettings({ affiliateTag, minConfidence: confidence });
    Alert.alert("Saved", "Settings updated.");
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      {/* Affiliate */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Amazon Associates</Text>
        <Text style={styles.label}>Affiliate Tag</Text>
        <TextInput
          style={styles.input}
          value={affiliateTag}
          onChangeText={setAffiliateTag}
          placeholder="your-tag-20"
          placeholderTextColor="#475569"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          All Amazon links will include this tag. Earnings go to your Associates account.
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL("https://affiliate-program.amazon.com/")}
        >
          <Text style={styles.link}>Get an Associates tag ↗</Text>
        </TouchableOpacity>
      </View>

      {/* Confidence */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scan Settings</Text>
        <Text style={styles.label}>Minimum Confidence (%)</Text>
        <TextInput
          style={styles.input}
          value={minConfidence}
          onChangeText={setMinConfidence}
          keyboardType="numeric"
          placeholderTextColor="#475569"
          placeholder="50"
        />
        <Text style={styles.hint}>
          Only show products with confidence above this threshold. Lower = more results.
        </Text>
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        {sessionToken ? (
          <Text style={styles.signedIn}>✅ Signed in</Text>
        ) : (
          <Text style={styles.hint}>
            Sign in to unlock higher scan quotas and sync across devices.
          </Text>
        )}
      </View>

      {/* Save */}
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save Settings</Text>
      </TouchableOpacity>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.hint}>StreamSnap AI v1.0.0</Text>
        <TouchableOpacity onPress={() => Linking.openURL("https://streamsnap.online")}>
          <Text style={styles.link}>streamsnap.online ↗</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F17" },
  section: {
    backgroundColor: "#111827",
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1E2533"
  },
  sectionTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "700", marginBottom: 16 },
  label: { color: "#94A3B8", fontSize: 13, fontWeight: "600", marginBottom: 8 },
  input: {
    backgroundColor: "#0B0F17",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    color: "#F8FAFC",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  hint: { color: "#64748B", fontSize: 12, marginTop: 8, lineHeight: 18 },
  link: { color: "#6366F1", fontSize: 13, marginTop: 8 },
  signedIn: { color: "#22C55E", fontSize: 14 },
  saveButton: {
    backgroundColor: "#6366F1",
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 }
});
