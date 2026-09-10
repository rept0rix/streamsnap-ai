import { useEffect, type ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Observe, ObserveRoot, useObserve } from "expo-observe";

Observe.configure({
  integrations: {
    "expo-router": {
      filteredParams: ["token", "id"]
    }
  }
});

function InteractiveMarker({ ready }: { ready: boolean }) {
  const { markInteractive } = useObserve();

  useEffect(() => {
    if (ready) {
      markInteractive();
    }
  }, [ready, markInteractive]);

  return null;
}

function ObserveFallback({
  resetError
}: {
  error?: unknown;
  resetError?: () => void;
}) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>StreamSnap hit an unexpected error. You can try again.</Text>
      {resetError ? (
        <TouchableOpacity style={styles.button} onPress={resetError}>
          <Text style={styles.buttonLabel}>Try again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ObservedApp({
  children,
  ready
}: {
  children: ReactNode;
  ready: boolean;
}) {
  return (
    <ObserveRoot errorBoundaryFallback={<ObserveFallback />}>
      <InteractiveMarker ready={ready} />
      {children}
    </ObserveRoot>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: "#0B0F17",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  title: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8
  },
  body: {
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 16
  },
  button: {
    backgroundColor: "#FF5500",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10
  },
  buttonLabel: {
    color: "#FFFFFF",
    fontWeight: "700"
  }
});
