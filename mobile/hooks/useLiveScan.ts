import { useCallback, useEffect, useRef, useState } from "react";
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
import { useNotificationStore } from "../store/useNotificationStore";
import type { Product } from "../services/api";

const WORKER_URL =
  (Constants.expoConfig?.extra as { workerUrl?: string } | undefined)?.workerUrl ??
  "https://streamsnap-lens.na0ryank0.workers.dev";

export function useLiveScan() {
  const { sessionToken } = useStore();
  const [state, setState] = useState<LiveScanState>(getLiveScanState);
  const available = isLiveScanAvailable();
  const ingestedKeys = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setState(getLiveScanState());
  }, []);

  const ingest = useCallback(async (products?: LiveScanProduct[]) => {
    const list = products ?? getLiveScanState().products;
    if (!list || list.length === 0) return;

    const store = useStore.getState();
    const currentCatalog = store.catalog;
    const notifStore = useNotificationStore.getState();

    for (const item of list) {
      if (!item.title || !(item.asin || item.url)) continue;
      const key = item.asin || item.url;
      if (!key) continue;
      if (ingestedKeys.current.has(key)) continue;
      ingestedKeys.current.add(key);

      const product: Product = {
        title: item.title,
        asin: item.asin,
        url: item.url || (item.asin ? `https://www.amazon.com/dp/${item.asin}` : ""),
        imageUrl: item.imageUrl,
        price: item.price,
        source: item.source === "other" ? "other" : "amazon",
        confidence: item.confidence
      };

      const alreadySaved = currentCatalog.some(
        (p) => (p.asin && p.asin === product.asin) || (p.url && p.url === product.url)
      );

      await store.saveProduct(product);

      if (!alreadySaved) {
        await notifStore.addNotification({
          id: `live-find-${product.asin || Date.now()}`,
          type: "scan_find",
          title: "⚡ Live Scan Found Product!",
          message: `${product.title}${product.price ? ` (${product.price})` : ""}`,
          product
        });
      }
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    let mounted = true;
    (async () => {
      const installId = await getInstallId();
      if (!mounted) return;
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

    // Poll periodically to catch extension writes
    const poll = setInterval(refresh, 3500);

    const app = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        refresh();
        void ingest();
      }
    });

    refresh();
    void ingest();

    return () => {
      mounted = false;
      sub.remove();
      clearInterval(poll);
      app.remove();
    };
  }, [refresh, ingest, sessionToken]);

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
