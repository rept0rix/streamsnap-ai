import { useEffect } from "react";
import { useObserve } from "expo-observe";

/** Native-only. Loaded through a dynamic require so Expo Go never evaluates expo-observe. */
export function ObserveInteractiveNative({ ready }: { ready: boolean }) {
  const { markInteractive } = useObserve();

  useEffect(() => {
    if (ready) {
      markInteractive();
    }
  }, [ready, markInteractive]);

  return null;
}
