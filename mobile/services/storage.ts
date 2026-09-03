/**
 * StreamSnap AI — AsyncStorage wrapper
 *
 * Typed persistence layer for catalog, settings, and session.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Product } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogItem extends Product {
  id: string;
  seenCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  /** base64-encoded cropped frame that triggered this detection */
  sourceFrameBase64?: string;
}

export interface AppSettings {
  affiliateTag: string;
  minConfidence: number;
  geminiApiKey: string; // stored locally for direct Gemini calls (optional)
  onboardingCompleted: boolean;
}

export interface CartItem {
  asin: string;
  title: string;
  quantity: number;
  imageUrl?: string;
  price?: string;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const KEYS = {
  CATALOG: "ss:catalog",
  SETTINGS: "ss:settings",
  CART: "ss:cart",
  SESSION_TOKEN: "ss:session_token",
  INSTALL_ID: "ss:install_id",
  DEVICE_ID: "ss:device_id"
} as const;

const CATALOG_MAX = 200;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: AppSettings = {
  affiliateTag: "streamsnap03-20",
  minConfidence: 50,
  geminiApiKey: "",
  onboardingCompleted: false
};

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

async function getJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function setJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export async function getCatalog(): Promise<CatalogItem[]> {
  return getJson<CatalogItem[]>(KEYS.CATALOG, []);
}

export async function upsertCatalogItem(
  item: Omit<CatalogItem, "id" | "seenCount" | "firstSeenAt" | "lastSeenAt"> & {
    id?: string;
    sourceFrameBase64?: string;
  }
): Promise<CatalogItem> {
  const catalog = await getCatalog();
  const now = Date.now();

  // Key by ASIN, URL, or normalized title to prevent duplicates
  const cleanTitle = item.title?.trim().toLowerCase();
  const existing = catalog.find(
    (c) =>
      (item.asin && c.asin === item.asin) ||
      (item.url && c.url === item.url) ||
      (cleanTitle && c.title?.trim().toLowerCase() === cleanTitle)
  );

  let updated: CatalogItem;
  if (existing) {
    updated = {
      ...existing,
      ...item,
      seenCount: existing.seenCount + 1,
      lastSeenAt: now
    };
    const idx = catalog.indexOf(existing);
    catalog[idx] = updated;
  } else {
    updated = {
      ...item,
      id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      seenCount: 1,
      firstSeenAt: now,
      lastSeenAt: now
    };
    catalog.unshift(updated);
  }

  // Cap at 200, evict oldest
  const trimmed = catalog
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, CATALOG_MAX);

  await setJson(KEYS.CATALOG, trimmed);
  return updated;
}

export async function clearCatalog(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CATALOG);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  return getJson<AppSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await setJson(KEYS.SETTINGS, next);
  return next;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export async function getCart(): Promise<CartItem[]> {
  return getJson<CartItem[]>(KEYS.CART, []);
}

export async function addToCart(item: Omit<CartItem, "quantity">): Promise<CartItem[]> {
  const cart = await getCart();
  const existing = cart.find((c) => c.asin === item.asin);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...item, quantity: 1 });
  }
  await setJson(KEYS.CART, cart);
  return cart;
}

export async function removeFromCart(asin: string): Promise<CartItem[]> {
  const cart = (await getCart()).filter((c) => c.asin !== asin);
  await setJson(KEYS.CART, cart);
  return cart;
}

export async function clearCart(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CART);
}

/** Build Amazon multi-item cart URL from current cart */
export async function buildCartUrl(affiliateTag: string): Promise<string> {
  const cart = await getCart();
  if (cart.length === 0) return "https://www.amazon.com";

  const params = new URLSearchParams({ tag: affiliateTag });
  cart.slice(0, 10).forEach((item, i) => {
    params.set(`ASIN.${i + 1}`, item.asin);
    params.set(`Quantity.${i + 1}`, String(item.quantity));
  });

  return `https://www.amazon.com/gp/aws/cart/add.html?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Session token
// ---------------------------------------------------------------------------

export async function getSessionToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.SESSION_TOKEN);
}

export async function setSessionToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.SESSION_TOKEN, token);
}

export async function clearSessionToken(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.SESSION_TOKEN);
}

// ---------------------------------------------------------------------------
// Install ID (stable device identifier for rate limiting)
// ---------------------------------------------------------------------------

export async function getInstallId(): Promise<string> {
  const stored = await AsyncStorage.getItem(KEYS.INSTALL_ID);
  if (stored) return stored;

  const id = `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(KEYS.INSTALL_ID, id);
  return id;
}

export async function getDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.DEVICE_ID);
}

export async function setDeviceId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.DEVICE_ID, id);
}
