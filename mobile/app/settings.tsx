/**
 * StreamSnap AI — Settings Screen
 */

import { useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import { useStore } from "../store/useStore";
import { ACCOUNT_PLANS_URL, fetchBillingInfo, getMe, type Quota } from "../services/api";
import { describeQuota } from "../services/scan";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, patchSettings, sessionToken } = useStore();

  const [affiliateTag, setAffiliateTag] = useState(
    settings?.affiliateTag ?? "streamsnap03-20"
  );
  const [minConfidence, setMinConfidence] = useState(
    String(settings?.minConfidence ?? 50)
  );
  const [geminiApiKey, setGeminiApiKey] = useState(settings?.geminiApiKey ?? "");
  const [quota, setQuota] = useState<Quota | null>(null);
  const [trialSize, setTrialSize] = useState<number>(100);
  const [plansUrl, setPlansUrl] = useState<string>(ACCOUNT_PLANS_URL);

  useEffect(() => {
    let cancelled = false;
    fetchBillingInfo().then((info) => {
      if (cancelled || !info) return;
      if (info.freeTrialScans) setTrialSize(info.freeTrialScans);
      if (info.upgradeUrl) setPlansUrl(info.upgradeUrl);
    });
    if (sessionToken) {
      getMe(sessionToken)
        .then((me) => {
          if (!cancelled && me.signedIn && me.quota) setQuota(me.quota);
        })
        .catch(() => {});
    } else {
      setQuota(null);
    }
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

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
    const key = geminiApiKey.trim();
    if (key && !/^[A-Za-z0-9_-]{20,}$/.test(key)) {
      Alert.alert("Invalid key", "That does not look like a Gemini API key (AIza…).");
      return;
    }
    await patchSettings({ affiliateTag, minConfidence: confidence, geminiApiKey: key });
    Alert.alert("Saved", key ? "Settings updated. Scans now run on your own key and are unlimited." : "Settings updated.");
  }

  const hasOwnKey = Boolean(settings?.geminiApiKey);
  const quotaLine = describeQuota(quota);

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

      {/* Scans & own key */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scans</Text>
        {hasOwnKey ? (
          <Text style={styles.signedIn}>∞ Unlimited — running on your own Gemini key</Text>
        ) : quotaLine ? (
          <Text style={styles.balance}>{quotaLine}</Text>
        ) : (
          <Text style={styles.hint}>
            Sign in to get {trialSize} free scans. After that, buy a scan pack or add your own Gemini key.
          </Text>
        )}
        {!hasOwnKey && quota && quota.exhausted ? (
          <Text style={[styles.hint, { color: "#F59E0B" }]}>
            You are out of free scans. Buy a pack below or add your own key.
          </Text>
        ) : null}
        {sessionToken ? (
          <TouchableOpacity onPress={() => Linking.openURL(plansUrl)}>
            <Text style={styles.link}>Buy more scans ↗</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={[styles.label, { marginTop: 18 }]}>Your own Gemini API key (optional)</Text>
        <TextInput
          style={styles.input}
          value={geminiApiKey}
          onChangeText={setGeminiApiKey}
          placeholder="AIzaSy…"
          placeholderTextColor="#475569"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text style={styles.hint}>
          With your own key, scans run on the same StreamSnap engine but on your Google account, so they
          are never counted against your free scans or packs. Free keys from Google AI Studio are enough
          for personal use. The key stays on this device.
        </Text>
        <TouchableOpacity onPress={() => Linking.openURL("https://aistudio.google.com/app/apikey")}>
          <Text style={styles.link}>Get a free Gemini key ↗</Text>
        </TouchableOpacity>
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        {sessionToken ? (
          <View>
            <Text style={styles.signedIn}>✅ Signed in and syncing</Text>
            <TouchableOpacity 
              style={{ marginTop: 16 }}
              onPress={() => {
                useStore.getState().setSessionToken(null);
                Alert.alert("Signed Out", "You have been signed out.");
              }}
            >
              <Text style={{ color: "#EF4444", fontSize: 14, fontWeight: "600" }}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.hint}>
              Sign in to get {trialSize} free scans and sync across devices.
            </Text>
            <TouchableOpacity 
              style={{ marginTop: 16 }}
              onPress={() => router.push("/login")}
            >
              <Text style={{ color: "#6366F1", fontSize: 14, fontWeight: "600" }}>Sign In with Google</Text>
            </TouchableOpacity>
          </View>
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
  balance: { color: "#F8FAFC", fontSize: 14, fontWeight: "600" },
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
