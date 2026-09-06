/**
 * StreamSnap AI — one way to run a scan, one way to explain a failed one.
 *
 * Every screen that scans (home, camera, share sheet) goes through here so the
 * session token, the install id and the user's own Gemini key are always sent
 * the same way, and so a 402 from the Worker turns into the same three-way
 * choice everywhere: sign in for the free trial, buy a scan pack, or add your
 * own key for unlimited scans.
 */

import { Alert, Linking } from "react-native";
import { ApiError, ACCOUNT_PLANS_URL, resolve, resolveUrl, type ResolveResult } from "./api";
import { getInstallId } from "./storage";
import { useStore } from "../store/useStore";

function credentials() {
  const { sessionToken, settings } = useStore.getState();
  return {
    token: sessionToken,
    options: { geminiKey: settings?.geminiApiKey || null }
  };
}

export async function scanImage(imageBase64: string): Promise<ResolveResult> {
  const installId = await getInstallId();
  const { token, options } = credentials();
  const data = await resolve(imageBase64, installId, token, options);
  if (!data.ok) throw new Error(data.error ?? "Scan failed");
  return data;
}

export async function scanUrl(url: string): Promise<ResolveResult> {
  const installId = await getInstallId();
  const { token, options } = credentials();
  const data = await resolveUrl(url, installId, token, options);
  if (!data.ok) throw new Error(data.error ?? "Scan failed");
  return data;
}

export interface ScanErrorNav {
  push: (href: any) => void;
}

/**
 * Show the right dialog for a failed scan. Returns true when it was the
 * paywall (so callers can skip their generic "Scan failed" alert).
 */
export function presentScanError(err: unknown, router: ScanErrorNav): boolean {
  if (!(err instanceof ApiError)) return false;

  if (err.isOwnKeyProblem) {
    Alert.alert("Your Gemini key did not work", err.message, [
      { text: "Fix in Settings", onPress: () => router.push("/settings") },
      { text: "OK", style: "cancel" }
    ]);
    return true;
  }

  if (!err.isPaywall) return false;

  const buttons: Array<{ text: string; style?: "cancel" | "default"; onPress?: () => void }> = [];
  if (err.needsSignIn) {
    buttons.push({ text: "Sign in with Google", onPress: () => router.push("/login") });
  }
  if (err.needsUpgrade) {
    buttons.push({ text: "Buy a scan pack", onPress: () => Linking.openURL(err.upgradeUrl || ACCOUNT_PLANS_URL) });
  }
  buttons.push({ text: "Use my own Gemini key", onPress: () => router.push("/settings") });
  buttons.push({ text: "Not now", style: "cancel" });

  Alert.alert(err.needsSignIn ? "Trial scans used up" : "Free scans used up", err.message, buttons);
  return true;
}

/** Human line for the balance, e.g. "87 of 100 free scans left · +200 purchased". */
export function describeQuota(quota: ResolveResult["quota"]): string | null {
  if (!quota) return null;
  const base =
    quota.period === "lifetime"
      ? `${quota.remaining} of ${quota.limit} free scans left`
      : `${quota.used} of ${quota.limit} scans used this month`;
  return quota.credits > 0 ? `${base} · +${quota.credits.toLocaleString()} purchased` : base;
}
