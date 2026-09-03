/**
 * StreamSnap AI — Zustand global store
 *
 * Single source of truth for scan state, catalog, cart, and settings.
 */

import { create } from "zustand";
import type { Product } from "../services/api";
import type { CatalogItem, CartItem, AppSettings } from "../services/storage";
import {
  getCatalog,
  upsertCatalogItem,
  getSettings,
  updateSettings,
  getCart,
  addToCart,
  removeFromCart,
  buildCartUrl
} from "../services/storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScanStatus = "idle" | "scanning" | "success" | "error";

interface StreamSnapState {
  // Scan
  scanStatus: ScanStatus;
  scanError: string | null;
  lastProducts: Product[];
  lastOthers: Product[];
  lastFrameBase64: string | null;

  // Catalog
  catalog: CatalogItem[];

  // Cart
  cart: CartItem[];

  // Settings
  settings: AppSettings | null;

  // Auth
  sessionToken: string | null;

  // Actions
  setScanStatus: (status: ScanStatus, error?: string) => void;
  setScanResults: (products: Product[], others: Product[], frameBase64?: string) => void;
  loadCatalog: () => Promise<void>;
  saveProduct: (product: Product, frameBase64?: string) => Promise<void>;
  loadCart: () => Promise<void>;
  addProductToCart: (product: Product) => Promise<void>;
  removeProductFromCart: (asin: string) => Promise<void>;
  getCartUrl: () => Promise<string>;
  loadSettings: () => Promise<void>;
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setSessionToken: (token: string | null) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<StreamSnapState>((set, get) => ({
  scanStatus: "idle",
  scanError: null,
  lastProducts: [],
  lastOthers: [],
  lastFrameBase64: null,
  catalog: [],
  cart: [],
  settings: null,
  sessionToken: null,

  setScanStatus: (status, error) =>
    set({ scanStatus: status, scanError: error ?? null }),

  setScanResults: (products, others, frameBase64) =>
    set({
      scanStatus: "success",
      scanError: null,
      lastProducts: products,
      lastOthers: others,
      lastFrameBase64: frameBase64 ?? null
    }),

  loadCatalog: async () => {
    let catalog = await getCatalog();
    const token = get().sessionToken;
    
    // If authenticated, sync with cloud
    if (token) {
      try {
        const { getUserProducts } = require("../services/api");
        const cloudData = await getUserProducts(token);
        
        if (cloudData.ok && cloudData.products) {
          // Merge cloud products into local catalog
          const cloudCatalog = cloudData.products.map((p: any) => ({
            id: p.id,
            asin: p.asin,
            title: p.title,
            price: p.price ? `$${p.price}` : undefined,
            imageUrl: p.image_url,
            url: p.product_url || (p.asin ? `https://www.amazon.com/dp/${p.asin}` : ""),
            source: p.source || "amazon",
            seenCount: p.sighting_count || 1,
            firstSeenAt: new Date(p.last_seen_at).getTime(),
            lastSeenAt: new Date(p.last_seen_at).getTime(),
          }));
          
          // Simple merge keeping newest based on ASIN/URL
          const merged = [...cloudCatalog];
          for (const localItem of catalog) {
            const key = localItem.asin || localItem.url;
            if (!merged.find(c => (c.asin || c.url) === key)) {
              merged.push(localItem);
            }
          }
          catalog = merged.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        }
      } catch (err) {
        console.warn("Cloud catalog sync failed:", err);
      }
    }
    
    set({ catalog });
  },

  saveProduct: async (product, frameBase64) => {
    const item = await upsertCatalogItem({
      ...product,
      sourceFrameBase64: frameBase64
    });
    const token = get().sessionToken;
    if (token) {
      try {
        const { sendSyncEvent } = require("../services/api");
        sendSyncEvent(token, "product.save", {
          id: item.id,
          asin: item.asin,
          title: item.title,
          price: item.price ? parseFloat(item.price.replace(/[^0-9.]/g, "")) : null,
          imageUrl: item.imageUrl,
          productUrl: item.url,
          source: item.source
        }).catch(() => {});
      } catch (_) {}
    }
    set((s) => {
      const existing = s.catalog.find((c) => c.id === item.id);
      if (existing) {
        return {
          catalog: s.catalog.map((c) => (c.id === item.id ? item : c))
        };
      }
      return { catalog: [item, ...s.catalog] };
    });
  },

  loadCart: async () => {
    let cart = await getCart();
    const token = get().sessionToken;
    if (token) {
      try {
        const { getSyncState } = require("../services/api");
        const cloudState = await getSyncState(token);
        if (cloudState.ok && cloudState.cartItems) {
          const cloudCart: CartItem[] = cloudState.cartItems.map((c: any) => ({
            asin: c.asin,
            title: c.title,
            quantity: c.quantity || 1,
            imageUrl: c.image_url,
            price: c.price ? `$${c.price}` : undefined
          }));
          const merged = [...cart];
          for (const item of cloudCart) {
            if (!merged.find((m) => m.asin === item.asin)) {
              merged.push(item);
            }
          }
          cart = merged;
        }
      } catch (err) {
        console.warn("Cloud cart sync error:", err);
      }
    }
    set({ cart });
  },

  addProductToCart: async (product) => {
    if (!product.asin) return;
    const cart = await addToCart({
      asin: product.asin,
      title: product.title,
      imageUrl: product.imageUrl,
      price: product.price
    });
    const token = get().sessionToken;
    if (token) {
      try {
        const { sendSyncEvent } = require("../services/api");
        sendSyncEvent(token, "cart.add", {
          asin: product.asin,
          title: product.title,
          imageUrl: product.imageUrl,
          price: product.price ? parseFloat(product.price.replace(/[^0-9.]/g, "")) : null,
          productUrl: product.url
        }).catch(() => {});
      } catch (_) {}
    }
    set({ cart });
  },

  removeProductFromCart: async (asin) => {
    const cart = await removeFromCart(asin);
    const token = get().sessionToken;
    if (token) {
      try {
        const { sendSyncEvent } = require("../services/api");
        sendSyncEvent(token, "cart.remove", { asin }).catch(() => {});
      } catch (_) {}
    }
    set({ cart });
  },

  getCartUrl: async () => {
    const { settings } = get();
    const tag = settings?.affiliateTag ?? "streamsnap03-20";
    return buildCartUrl(tag);
  },

  loadSettings: async () => {
    const settings = await getSettings();
    set({ settings });
  },

  patchSettings: async (patch) => {
    const settings = await updateSettings(patch);
    set({ settings });
  },

  setSessionToken: (token) => {
    const { setSessionToken: persistToken, clearSessionToken, getDeviceId, setDeviceId } = require("../services/storage");
    const { subscribeToSyncHub } = require("../services/api");
    if (token) {
      persistToken(token);
      // Register device in background
      try {
        const { registerMobileDevice } = require("../services/api");
        const { Platform } = require("react-native");
        const platformName = Platform ? Platform.OS : "mobile";
        getDeviceId().then((existingId: string | null) => {
          registerMobileDevice(token, platformName, existingId).then((res: any) => {
            if (res?.deviceId) setDeviceId(res.deviceId);
          });
        });

        // Initialize Live Sync
        subscribeToSyncHub(token, () => {
          get().loadCatalog();
          get().loadCart();
        });
      } catch (_) {}
    } else {
      clearSessionToken();
      // To properly clear WS, we might need to close it. For now, subscribeToSyncHub closes old connections.
      subscribeToSyncHub("", () => {});
    }
    set({ sessionToken: token });
  },

  reset: () =>
    set({
      scanStatus: "idle",
      scanError: null,
      lastProducts: [],
      lastOthers: [],
      lastFrameBase64: null
    })
}));
