import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import {
  addLiveScanListener,
  getLiveScanState,
  isLiveScanAvailable,
  requestLiveScanNotifications,
  startLiveBroadcast,
  syncLiveScanCredentials,
  type LiveScanProduct,
  type LiveScanState
} from "../modules/live-scan/src";
import { getInstallId } from "../services/storage";
import { useStore } from "../store/useStore";
import type { Product } from "../services/api";

const WORKER_URL =
  (Constants.expoConfig?.extra as { workerUrl?: string } | undefined)?.workerUrl ??
  "https://streamsnap-lens.na0ryank0.workers.dev";

export function useLiveScan() {
  const { sessionToken, saveProduct } = useStore();
  const [state, setState] = useState<LiveScanState>(getLiveScanState);
  const available = isLiveScanAvailable();

  const refresh = useCallback(() => {
    setState(getLiveScanState());
  }, []);

  const ingest = useCallback(
    async (products?: LiveScanProduct[]) => {
      const list = products ?? getLiveScanState().products;
      for (const item of list) {
        if (!item.title || !(item.asin || item.url)) continue;
        const product: Product = {
          title: item.title,
          asin: item.asin,
          url: item.url || (item.asin ? `https://www.amazon.com/dp/${item.asin}` : ""),
          imageUrl: item.imageUrl,
          price: item.price,
          source: item.source === "other" ? "other" : "amazon",
          confidence: item.confidence
        };
        await saveProduct(product);
      }
    },
    [saveProduct]
  );

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    let cancelled = false;
    (async () => {
      const installId = await getInstallId();
      if (cancelled) return;
      await syncLiveScanCredentials({
        token: sessionToken,
        installId,
        workerUrl: WORKER_URL
      });
    })();

    const sub = addLiveScanListener((next) => {
      setState(next);
      void ingest(next.products);
    });
    const poll = setInterval(refresh, 2500);
    const app = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        refresh();
        void ingest();
      }
    });

    refresh();
    void ingest();

    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(poll);
      app.remove();
    };
  }, [ingest, refresh, sessionToken]);

  const start = useCallback(async () => {
    await requestLiveScanNotifications();
    const installId = await getInstallId();
    await syncLiveScanCredentials({
      token: sessionToken,
      installId,
      workerUrl: WORKER_URL
    });
    await startLiveBroadcast();
  }, [sessionToken]);

  return { available, state, start, refresh, ingest };
}
