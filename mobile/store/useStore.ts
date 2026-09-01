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
    const catalog = await getCatalog();
    set({ catalog });
  },

  saveProduct: async (product, frameBase64) => {
    const item = await upsertCatalogItem({
      ...product,
      sourceFrameBase64: frameBase64
    });
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
    const cart = await getCart();
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
    set({ cart });
  },

  removeProductFromCart: async (asin) => {
    const cart = await removeFromCart(asin);
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

  setSessionToken: (token) => set({ sessionToken: token }),

  reset: () =>
    set({
      scanStatus: "idle",
      scanError: null,
      lastProducts: [],
      lastOthers: [],
      lastFrameBase64: null
    })
}));
