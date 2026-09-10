import { createContext, useContext, type ReactNode } from "react";
import { isExpoGoOrWeb } from "./expoGo";

/**
 * Mirrors the root layout's splash/startup `ready` flag so entry screens can
 * call `markInteractive` after catalog/settings/cart/notifications load,
 * without importing `expo-observe` in Expo Go.
 */
export const AppReadyContext = createContext(false);

export function AppReadyProvider({
  ready,
  children
}: {
  ready: boolean;
  children: ReactNode;
}) {
  return <AppReadyContext.Provider value={ready}>{children}</AppReadyContext.Provider>;
}

/**
 * Per-screen Time to Interactive. Uses `useObserve()` (router-scoped) on native
 * builds. No-ops in Expo Go and on web — `expo-observe` is never imported there.
 */
export function ObserveInteractive() {
  const ready = useContext(AppReadyContext);
  if (isExpoGoOrWeb) return null;
  const { ObserveInteractiveNative } = require("./observeInteractiveNative") as typeof import("./observeInteractiveNative");
  return <ObserveInteractiveNative ready={ready} />;
}

/**
 * Report a handled error to EAS Observe without sending message bodies that
 * might include API text, tokens, or other PII. No-ops in Expo Go / web.
 */
export function reportObservedError(error: unknown, context: string): void {
  if (isExpoGoOrWeb) return;
  try {
    const { Observe } = require("expo-observe") as typeof import("expo-observe");
    if (error instanceof Error) {
      const sanitized = new Error(`${context}:${error.name}`);
      sanitized.name = error.name;
      sanitized.stack = error.stack;
      Observe.reportError(sanitized);
    } else {
      Observe.reportError(new Error(context));
    }
  } catch {
    // Native module unavailable (Expo Go) or Observe not linked yet.
  }
}
