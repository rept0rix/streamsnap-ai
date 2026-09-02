import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";
import { getInstallId } from "../services/storage";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setSessionToken, loadCatalog } = useStore();
  const [loading, setLoading] = useState(false);

  // Deep link to return to the app
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "streamsnap",
  });

  async function handleLogin() {
    setLoading(true);
    try {
      const installId = await getInstallId();
      
      // We initiate the OAuth flow via the Worker.
      // The Worker handles Google OAuth and redirects back to us with the token in the hash.
      const authUrl = `https://streamsnap-lens.na0ryank0.workers.dev/auth/start?client=extension&return_to=${encodeURIComponent(
        redirectUri
      )}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === "success" && result.url) {
        // Extract token from URL hash: streamsnap://...?#token=...
        const url = new URL(result.url);
        let token = url.hash.match(/token=([^&]+)/)?.[1];
        
        // If it somehow landed in the query string instead
        if (!token) {
          token = url.searchParams.get("token");
        }

        if (token) {
          await setSessionToken(decodeURIComponent(token));
          // Refresh the catalog from the cloud
          await loadCatalog();
          router.replace("/");
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>⚡ StreamSnap AI</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Welcome to StreamSnap</Text>
        <Text style={styles.subtitle}>
          Sign in to sync your catalog across your phone and Chrome Extension, and unlock higher scanning quotas.
        </Text>

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Connecting..." : "Sign in with Google"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={() => router.replace("/")}>
          <Text style={styles.skipText}>Continue as guest</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F17" },
  header: { padding: 20 },
  logo: { color: "#F8FAFC", fontSize: 24, fontWeight: "800" },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  title: { color: "#F8FAFC", fontSize: 28, fontWeight: "800", marginBottom: 12, textAlign: "center" },
  subtitle: { color: "#94A3B8", fontSize: 16, lineHeight: 24, marginBottom: 40, textAlign: "center" },
  button: {
    backgroundColor: "#6366F1",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skipButton: { paddingVertical: 12, alignItems: "center" },
  skipText: { color: "#64748B", fontSize: 15, fontWeight: "600" }
});
