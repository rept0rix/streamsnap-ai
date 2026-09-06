/**
 * StreamSnap AI — MV3 Service Worker
 *
 * Responsibilities: tab capture, server-side recognition, detection
 * reconciliation, catalog persistence, cart, and analytics.
 *
 * Every scan goes through the StreamSnap Worker (one engine for Chrome and
 * mobile). A personal Gemini key, if the user added one, rides along as the
 * X-Gemini-Key header: the Worker then runs on their key and does not meter
 * the scan. Without a key the Worker meters the free trial / purchased packs
 * and answers 402 when they run out.
 *
 * Two constraints shape this file:
 *  1. The service worker is evicted after ~30s idle, so no long-lived timers.
 *     Scheduling goes through chrome.alarms.
 *  2. Nothing is fabricated. If analysis fails the user sees the failure; we do
 *     not synthesize plausible-looking products or ASINs.
 */

import {
  resolveDetection,
  categorizeProduct,
  estimateCommission
} from "../services/amazon_service.js";
import { lookupFrame, recordFrame } from "../services/frame_cache.js";
import { getApiBase, getToken, rememberQuota } from "../services/account.js";
import {
  downscaleDataUrl,
  enforceCatalogBudget,
  safeSet,
  LIMITS
} from "../services/storage.js";

const DEFAULTS = {
  discoveredCatalog: [],
  analytics: { totalScans: 0, amazonClicks: 0, cartAdds: 0, estimatedEarnings: 0 },
  cartItems: [],
  autoScanIntervalSec: 0, // 0 = manual
  minConfidence: 50,
  affiliateTag: "streamsnap03-20",
  showFloatingControls: true,
  onboardingCompleted: false,
  extensionEnabled: true // master on/off switch
};

async function isExtensionEnabled() {
  const { extensionEnabled } = await chrome.storage.local.get(["extensionEnabled"]);
  return extensionEnabled !== false;
}

/**
 * True when the panel has positively determined this build is older than the
 * server's required minimum. Refusing scans here means an outdated build cannot
 * keep working through the on-video controls either. Fails open: if the gate has
 * never run (no cached verdict), scanning is allowed.
 */
async function isUpdateRequired() {
  const { versionGate } = await chrome.storage.local.get(["versionGate"]);
  return Boolean(versionGate?.blocked);
}

const AUTO_SCAN_ALARM = "streamsnap-auto-scan";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function ensureDefaults() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const updates = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (stored[key] === undefined) updates[key] = value;
  }
  if (Object.keys(updates).length) await safeSet(updates);
  return { ...DEFAULTS, ...stored, ...updates };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await ensureDefaults();
  await syncAutoScanAlarm(settings.autoScanIntervalSec);
  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("onboarding/onboarding.html")
    });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await ensureDefaults();
  await syncAutoScanAlarm(settings.autoScanIntervalSec);
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("[StreamSnap] side panel behavior:", error));

// ---------------------------------------------------------------------------
// Auto-scan scheduling
//
// setInterval does not survive service worker eviction, so auto-scan silently
// stopped after ~30 seconds. chrome.alarms wakes the worker instead.
// Chrome enforces a 30s floor on alarm periods.
// ---------------------------------------------------------------------------

async function syncAutoScanAlarm(intervalSeconds) {
  await chrome.alarms.clear(AUTO_SCAN_ALARM);
  // A disabled extension must never wake itself to scan in the background.
  if (!(await isExtensionEnabled())) return;
  const seconds = Number(intervalSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  const periodInMinutes = Math.max(0.5, seconds / 60);
  chrome.alarms.create(AUTO_SCAN_ALARM, { periodInMinutes });
  console.info(`[StreamSnap] auto-scan every ${(periodInMinutes * 60).toFixed(0)}s`);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTO_SCAN_ALARM) return;
  if (!(await isExtensionEnabled())) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { action: "TRIGGER_AUTO_SCAN" }).catch(() => {
    /* no content script on this tab — expected */
  });
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.autoScanIntervalSec) {
    const { autoScanIntervalSec } = await chrome.storage.local.get(["autoScanIntervalSec"]);
    syncAutoScanAlarm(autoScanIntervalSec);
  }
  // Toggling the master switch re-evaluates whether the alarm should exist.
  if (changes.extensionEnabled) {
    const { autoScanIntervalSec } = await chrome.storage.local.get(["autoScanIntervalSec"]);
    syncAutoScanAlarm(autoScanIntervalSec);
  }
});

// ---------------------------------------------------------------------------
// Analysis pipeline
// ---------------------------------------------------------------------------

function normalizeConfidence(item) {
  // The model returns confidence as 0-1 and similarityScore as 0-100.
  const raw = item.confidence ?? item.similarityScore;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

/**
 * Validate and reconcile the raw model response.
 *
 * Two rules learned the hard way:
 *
 *  1. A missing confidence means *unknown*, not zero. Treating an absent field
 *     as 0 silently deleted every detection whenever the model omitted the
 *     field — which it does often — and the panel showed "nothing found" for a
 *     frame full of products.
 *
 *  2. An item is never dropped without telling anyone. `filteredCount` is
 *     returned so the UI can say "3 items were hidden by your confidence
 *     setting" instead of pretending the frame was empty.
 */
function reconcileResults(raw, minConfidence) {
  const out = { exactMatches: [], lookAlikes: [], filteredCount: 0 };
  if (!raw || typeof raw !== "object") return out;

  let filtered = 0;

  const rawExact = Array.isArray(raw.exactMatches) ? raw.exactMatches : [];
  const rawLookAlikes = Array.isArray(raw.lookAlikes) ? raw.lookAlikes : [];

  for (const item of rawExact) {
    const resolved = resolveDetection(item);
    if (!resolved) continue;
    const conf = normalizeConfidence(item);
    const resolvedItem = { ...resolved, tier: "exact", confidence: conf };

    if (conf === null || conf >= minConfidence) {
      out.exactMatches.push(resolvedItem);
    } else if (conf >= Math.max(30, minConfidence - 25)) {
      // Instead of discarding live detections under motion blur, gracefully downgrade to lookAlikes
      out.lookAlikes.push({ ...resolvedItem, tier: "lookalike" });
    } else {
      filtered += 1;
    }
  }

  for (const item of rawLookAlikes) {
    const resolved = resolveDetection(item);
    if (!resolved) continue;
    const conf = normalizeConfidence(item);
    const resolvedItem = { ...resolved, tier: "lookalike", confidence: conf };

    if (conf === null || conf >= Math.max(25, minConfidence - 20)) {
      out.lookAlikes.push(resolvedItem);
    } else {
      filtered += 1;
    }
  }

  out.filteredCount = filtered;
  return out;
}

function countResults(results) {
  return (results?.exactMatches?.length || 0) + (results?.lookAlikes?.length || 0);
}

/**
 * Crop a region out of a frame using the model's normalized box (0-1000).
 */
async function extractCropFromBox(imageDataUrl, box) {
  if (!Array.isArray(box) || box.length < 4 || !imageDataUrl) return null;
  try {
    const clean = imageDataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));

    const [ymin, xmin, ymax, xmax] = box.map(Number);
    if (![ymin, xmin, ymax, xmax].every(Number.isFinite) || xmax <= xmin || ymax <= ymin) {
      bitmap.close();
      return null;
    }

    const margin = 0.04;
    const nx0 = Math.max(0, xmin / 1000 - margin);
    const ny0 = Math.max(0, ymin / 1000 - margin);
    const nx1 = Math.min(1, xmax / 1000 + margin);
    const ny1 = Math.min(1, ymax / 1000 + margin);

    const sx = Math.round(nx0 * bitmap.width);
    const sy = Math.round(ny0 * bitmap.height);
    const sw = Math.max(20, Math.round((nx1 - nx0) * bitmap.width));
    const sh = Math.max(20, Math.round((ny1 - ny0) * bitmap.height));

    const canvas = new OffscreenCanvas(sw, sh);
    canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    const buffer = await blob.arrayBuffer();
    const outBytes = new Uint8Array(buffer);
    let out = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < outBytes.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, outBytes.subarray(i, i + CHUNK));
    }
    return `data:image/jpeg;base64,${btoa(out)}`;
  } catch (err) {
    console.warn("[StreamSnap] crop failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function saveDiscoveredProducts(results, streamContext) {
  const { discoveredCatalog = [], analytics = DEFAULTS.analytics } =
    await chrome.storage.local.get(["discoveredCatalog", "analytics"]);

  let catalog = [...discoveredCatalog];
  const nextAnalytics = { ...analytics, totalScans: (analytics.totalScans || 0) + 1 };

  const allItems = [...(results.exactMatches || []), ...(results.lookAlikes || [])];
  const now = new Date().toISOString();

  for (const item of allItems) {
    const category = item.category || categorizeProduct(item.title);
    const normTitle = String(item.title || "").toLowerCase().trim();
    if (!normTitle) continue;

    const existingIndex = catalog.findIndex(
      (p) =>
        (item.asin && p.asin && p.asin === item.asin) ||
        String(p.title || "").toLowerCase().trim() === normTitle
    );

    if (existingIndex >= 0) {
      const existing = catalog[existingIndex];
      existing.sightingCount = (existing.sightingCount || 1) + 1;
      existing.lastSeenAt = now;
      existing.lastStream = streamContext?.title || "Live Stream";
      if (item.thumbnail && !existing.sourceCrop) existing.sourceCrop = item.thumbnail;
      if (item.price && !existing.price) existing.price = item.price;
      if (item.originalPrice) existing.originalPrice = item.originalPrice;
      if (item.discountPercent) existing.discountPercent = item.discountPercent;
      if (item.dealBadge) existing.dealBadge = item.dealBadge;
      // Move recently-seen items to the front so eviction drops truly stale ones.
      catalog.splice(existingIndex, 1);
      catalog.unshift(existing);
      continue;
    }

    catalog.unshift({
      id: `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      asin: item.asin || null,
      verified: Boolean(item.verified),
      title: item.title,
      price: typeof item.price === "number" ? item.price : null,
      originalPrice: typeof item.originalPrice === "number" ? item.originalPrice : null,
      discountPercent: typeof item.discountPercent === "number" ? item.discountPercent : null,
      dealBadge: item.dealBadge || null,
      image: item.image || null,
      category,
      tier: item.tier || "exact",
      confidence: item.confidence ?? 0,
      matchReason: item.matchReason || item.detectionLabel || "Detected in video stream",
      sourceCrop: item.thumbnail || null,
      streamTitle: streamContext?.title || "Live Stream",
      firstSeenAt: now,
      lastSeenAt: now,
      sightingCount: 1,
      estimatedCommission:
        typeof item.price === "number" ? estimateCommission(item.price, category) : null
    });
  }

  catalog = await enforceCatalogBudget(catalog);
  await safeSet({ discoveredCatalog: catalog, analytics: nextAnalytics });
  broadcast({ action: "CATALOG_UPDATED", discoveredCatalog: catalog });
  return catalog;
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    /* no receiver (side panel closed) — expected */
  });
}

async function publishScanResult(payload) {
  await safeSet({ latestScanResults: payload, isScanning: false });
  broadcast({ action: "SCAN_RESULTS_UPDATED", data: payload });
}

/**
 * Errors carry structure, not just text: a 402 from the Worker becomes a
 * paywall card in the panel (sign in / buy scans / add your own key) instead of
 * a generic "scan failed".
 */
function describeError(err) {
  const info = {
    message: err?.message || "Scan failed.",
    code: err?.code || null,
    needsSignIn: Boolean(err?.needsSignIn),
    needsUpgrade: Boolean(err?.needsUpgrade),
    canUseOwnKey: Boolean(err?.canUseOwnKey),
    upgradeUrl: err?.upgradeUrl || null,
    quota: err?.quota || null
  };
  return info;
}

async function publishScanError(err) {
  const info = typeof err === "string" ? describeError(new Error(err)) : describeError(err);
  await safeSet({ isScanning: false, lastScanError: info.message, lastScanErrorInfo: info });
  broadcast({ action: "SCAN_FAILED", error: info.message, ...info });
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Shape one Worker product for the panel. Everything the server worked out
 * (crop box, per-product crop, verified ASIN, catalog image) is kept — the
 * earlier mapping dropped all of it, so every card showed the full frame twice
 * and no listing could ever be shown as verified.
 */
function fromServerProduct(p, tier) {
  const catalogImage = p.imageUrl || p.image || p.thumbnail || null;
  return {
    source: "server",
    tier,
    title: p.matchedTitle && p.verified ? p.matchedTitle : p.title,
    detectionLabel: p.title,
    brand: p.brand || null,
    asin: p.asin || null,
    verified: Boolean(p.verified && p.asin),
    amazon_url: p.url || null,
    image: catalogImage,
    price: p.priceValue ?? toNumber(p.price),
    priceEstimated: Boolean(p.priceEstimated),
    confidence: p.confidence ?? null,
    matchReason: p.matchReason || null,
    matchedTitle: p.matchedTitle || null,
    category: p.category || null,
    box_2d: Array.isArray(p.box_2d) ? p.box_2d : null,
    sourceCrop: typeof p.sourceCrop === "string" && p.sourceCrop.startsWith("data:") ? p.sourceCrop : null,
    videoTitle: p.videoTitle || null
  };
}

async function callServerResolve(imageDataUrl, { apiKey } = {}) {
  const { installId } = await chrome.storage.local.get(["installId"]);
  let id = installId;
  if (!id) {
    id = crypto.randomUUID();
    await chrome.storage.local.set({ installId: id });
  }

  const token = await getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // The user's own key: the Worker runs on it and does not meter the scan.
  if (apiKey) headers["X-Gemini-Key"] = apiKey;

  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ image: imageDataUrl, installId: id })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    const err = new Error(
      data.error ||
        (response.status === 401 || response.status === 403
          ? "Session could not be verified. Please sign in again."
          : `Server error ${response.status}`)
    );
    err.status = response.status;
    err.code = data.code || (response.status === 402 ? "QUOTA_EXHAUSTED" : null);
    err.needsSignIn = Boolean(data.needsSignIn);
    err.needsUpgrade = Boolean(data.needsUpgrade);
    err.canUseOwnKey = Boolean(data.canUseOwnKey);
    err.upgradeUrl = data.upgradeUrl || null;
    err.quota = data.quota || null;
    if (data.quota) await rememberQuota(data.quota);
    throw err;
  }

  if (data.quota) await rememberQuota(data.quota);

  // Verified Amazon listings arrive in `amazon`; visual-only detections in
  // `others`. (`products` is the union — reading it as exact matches showed
  // every unverified item twice.)
  const amazon = Array.isArray(data.amazon)
    ? data.amazon
    : (data.products || []).filter((p) => p.verified && p.asin);
  const others = Array.isArray(data.others)
    ? data.others
    : (data.products || []).filter((p) => !(p.verified && p.asin));

  return {
    exactMatches: amazon.map((p) => fromServerProduct(p, "exact")),
    lookAlikes: others.map((p) => fromServerProduct(p, "lookalike")),
    engine: data.engine || null,
    byoKey: Boolean(data.byoKey),
    quota: data.quota || null
  };
}

/**
 * Shared analysis path for both full-frame and cropped scans.
 */
async function runAnalysis({ imageDataUrl, apiKey, streamContext, mode }) {
  const { minConfidence = DEFAULTS.minConfidence } =
    await chrome.storage.local.get(["minConfidence"]);
  const streamKey = streamContext?.title || "";
  const isCrop = mode === "crop";

  // Skip the API entirely when this frame matches one we already analyzed.
  const { hash, cachedResult, distance } = await lookupFrame(imageDataUrl, streamKey);
  let raw;
  let fromCache = false;

  if (cachedResult) {
    raw = cachedResult;
    fromCache = true;
    console.info(`[StreamSnap] frame cache hit (distance ${distance}) — no API call`);
  } else {
    console.info(`[StreamSnap] resolve via server${apiKey ? " (own Gemini key)" : ""}.`);
    raw = await callServerResolve(imageDataUrl, { apiKey });
    if (hash) recordFrame(hash, raw, streamKey);
  }

  const results = reconcileResults(raw, minConfidence);

  // Attach a bounded live crop per item — the Worker's per-product crop when it
  // sent one, else our own cut from its box, else the user's selection / frame.
  // `thumbnail`/`sourceCrop` are the live crop; `image` stays the catalog photo.
  await Promise.all(
    [...results.exactMatches, ...results.lookAlikes].map(async (item) => {
      const source = isCrop
        ? imageDataUrl
        : item.sourceCrop || (await extractCropFromBox(imageDataUrl, item.box_2d)) || imageDataUrl;
      const thumb = await downscaleDataUrl(source, LIMITS.THUMB_MAX_EDGE);
      item.thumbnail = thumb;
      item.sourceCrop = thumb;
    })
  );

  await saveDiscoveredProducts(results, streamContext);

  const snapshot = await downscaleDataUrl(imageDataUrl, LIMITS.SNAPSHOT_MAX_EDGE);
  const payload = {
    streamType: isCrop
      ? `Cropped: ${streamKey || "Live Stream"}`
      : streamKey || "Live Stream",
    frameSnapshot: snapshot,
    croppedThumbnail: isCrop ? snapshot : null,
    items: results,
    matchCount: countResults(results),
    filteredCount: results.filteredCount || 0,
    minConfidence,
    fromCache,
    engine: raw?.engine || null,
    byoKey: Boolean(raw?.byoKey),
    quota: raw?.quota || null,
    capturedAt: new Date().toLocaleTimeString()
  };

  await publishScanResult(payload);
  return payload;
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

const handlers = {
  async OPEN_SIDEPANEL(_message, sender) {
    if (sender.tab?.id) {
      await chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    }
    return { status: "ok" };
  },

  async CAPTURE_VISIBLE_TAB() {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 85 });
      return dataUrl ? { dataUrl } : { error: "Capture returned no data." };
    } catch (err) {
      return { error: err?.message || "Failed to capture tab." };
    }
  },

  async ANALYZE_WITH_AI(message) {
    if (await isUpdateRequired()) {
      const reason = "StreamSnap must be updated before you can scan.";
      await publishScanError(reason);
      return { success: false, error: reason, updateRequired: true };
    }
    if (!(await isExtensionEnabled())) {
      const reason = "StreamSnap is turned off. Turn it on to scan.";
      await publishScanError(reason);
      return { success: false, error: reason, disabled: true };
    }
    try {
      const data = await runAnalysis({
        imageDataUrl: message.imageBase64,
        apiKey: message.apiKey,
        streamContext: message.streamContext,
        mode: "frame"
      });
      return { success: true, data };
    } catch (err) {
      await publishScanError(err);
      return { success: false, error: err?.message || "Scan failed.", ...describeError(err) };
    }
  },

  async ANALYZE_CROPPED_IMAGE(message) {
    if (await isUpdateRequired()) {
      const reason = "StreamSnap must be updated before you can scan.";
      await publishScanError(reason);
      return { success: false, error: reason, updateRequired: true };
    }
    if (!(await isExtensionEnabled())) {
      const reason = "StreamSnap is turned off. Turn it on to scan.";
      await publishScanError(reason);
      return { success: false, error: reason, disabled: true };
    }
    try {
      const data = await runAnalysis({
        imageDataUrl: message.croppedImage,
        apiKey: message.apiKey,
        streamContext: message.streamContext,
        mode: "crop"
      });
      return { success: true, data };
    } catch (err) {
      await publishScanError(err);
      return { success: false, error: err?.message || "Crop analysis failed.", ...describeError(err) };
    }
  },

  async TRACK_AMAZON_CLICK(message) {
    const { analytics = DEFAULTS.analytics } = await chrome.storage.local.get(["analytics"]);
    const next = { ...analytics, amazonClicks: (analytics.amazonClicks || 0) + 1 };
    await safeSet({ analytics: next });
    broadcast({ action: "ANALYTICS_UPDATED", analytics: next });
    return { status: "tracked" };
  },

  async ADD_TO_CART(message) {
    const product = message.product;
    if (!product?.title) return { status: "ignored" };

    const { cartItems = [], analytics = DEFAULTS.analytics } = await chrome.storage.local.get([
      "cartItems",
      "analytics"
    ]);

    const cart = [...cartItems];
    const existing = cart.find(
      (i) => (product.asin && i.asin === product.asin) || i.title === product.title
    );
    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
    } else {
      cart.push({ ...product, quantity: 1, addedAt: Date.now() });
    }

    const commission =
      typeof product.price === "number"
        ? estimateCommission(product.price, product.category || "")
        : 0;
    const next = {
      ...analytics,
      cartAdds: (analytics.cartAdds || 0) + 1,
      estimatedEarnings: parseFloat(((analytics.estimatedEarnings || 0) + commission).toFixed(2))
    };

    await safeSet({ cartItems: cart, analytics: next });
    broadcast({ action: "CART_UPDATED", cartItems: cart });
    broadcast({ action: "ANALYTICS_UPDATED", analytics: next });
    return { status: "added", cartItems: cart };
  },

  async GET_CART() {
    const { cartItems = [] } = await chrome.storage.local.get(["cartItems"]);
    return { cartItems };
  },

  async CLEAR_CART() {
    await safeSet({ cartItems: [] });
    broadcast({ action: "CART_UPDATED", cartItems: [] });
    return { status: "cleared" };
  },

  async REMOVE_CART_ITEM(message) {
    const { cartItems = [] } = await chrome.storage.local.get(["cartItems"]);
    const cart = cartItems.filter((i) => i.title !== message.title || i.asin !== message.asin);
    await safeSet({ cartItems: cart });
    broadcast({ action: "CART_UPDATED", cartItems: cart });
    return { status: "removed", cartItems: cart };
  },

  async CLEAR_CATALOG() {
    await safeSet({ discoveredCatalog: [] });
    broadcast({ action: "CATALOG_UPDATED", discoveredCatalog: [] });
    return { status: "cleared" };
  },

  async DELETE_CATALOG_ITEM(message) {
    const { discoveredCatalog = [] } = await chrome.storage.local.get(["discoveredCatalog"]);
    const catalog = discoveredCatalog.filter((item) => item.id !== message.id);
    await safeSet({ discoveredCatalog: catalog });
    broadcast({ action: "CATALOG_UPDATED", discoveredCatalog: catalog });
    return { status: "deleted", discoveredCatalog: catalog };
  },

  async GET_LATEST_SCAN() {
    const { latestScanResults = null } = await chrome.storage.local.get(["latestScanResults"]);
    return { data: latestScanResults };
  },

  // -------------------------------------------------------------------------
  // Deletion
  //
  // Every category of stored data must be removable by the person it belongs
  // to. Until now the only way out was clearing history and the cart, which
  // left the API key, the affiliate tag, the analytics counters and — worst —
  // latestScanResults, a full frame from whatever the user last scanned,
  // sitting in storage with no way to remove them.
  // -------------------------------------------------------------------------

  async GET_STORAGE_REPORT() {
    const stored = await chrome.storage.local.get(null);
    const sizeOf = (value) =>
      value === undefined ? 0 : new Blob([JSON.stringify(value)]).size;

    let totalBytes = 0;
    try {
      totalBytes = await chrome.storage.local.getBytesInUse(null);
    } catch {
      totalBytes = Object.values(stored).reduce((sum, v) => sum + sizeOf(v), 0);
    }

    return {
      totalBytes,
      hasApiKey: Boolean(stored.geminiApiKey),
      hasAffiliateTag: Boolean(stored.affiliateTag),
      catalogCount: (stored.discoveredCatalog || []).length,
      cartCount: (stored.cartItems || []).length,
      hasLastScan: Boolean(stored.latestScanResults),
      historyBytes: sizeOf(stored.discoveredCatalog),
      lastScanBytes: sizeOf(stored.latestScanResults)
    };
  },

  async DELETE_API_KEY() {
    await chrome.storage.local.remove(["geminiApiKey"]);
    broadcast({ action: "SETTINGS_RESET", field: "geminiApiKey" });
    return { status: "deleted" };
  },

  async DELETE_AFFILIATE_TAG() {
    await chrome.storage.local.remove(["affiliateTag"]);
    broadcast({ action: "SETTINGS_RESET", field: "affiliateTag" });
    return { status: "deleted" };
  },

  async DELETE_LAST_SCAN() {
    await chrome.storage.local.remove(["latestScanResults", "lastScanError", "lastScanErrorInfo"]);
    broadcast({ action: "SCAN_CLEARED" });
    return { status: "deleted" };
  },

  async RESET_ANALYTICS() {
    await safeSet({ analytics: { ...DEFAULTS.analytics } });
    broadcast({ action: "ANALYTICS_UPDATED", analytics: { ...DEFAULTS.analytics } });
    return { status: "reset" };
  },

  /**
   * Remove everything this extension has ever stored, then re-seed defaults so
   * the extension is usable rather than left in a half-initialised state.
   */
  async DELETE_ALL_DATA() {
    await chrome.alarms.clear(AUTO_SCAN_ALARM);
    await chrome.storage.local.clear();
    await safeSet({ ...DEFAULTS });

    broadcast({ action: "ALL_DATA_DELETED" });
    return { status: "deleted" };
  },

  async OPEN_ONBOARDING() {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("onboarding/onboarding.html")
    });
    return { status: "opened" };
  }
};

// Keyboard shortcut. The old chrome.action.onClicked handler never fired,
// because setPanelBehavior({ openPanelOnActionClick: true }) consumes the click.
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "scan-active-stream") return;
  if (!(await isExtensionEnabled())) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  chrome.tabs.sendMessage(tab.id, { action: "TRIGGER_SCAN" }).catch(() => {
    /* not a supported streaming site */
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.action];
  if (!handler) return false;

  handler(message, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error(`[StreamSnap] ${message.action} failed:`, err);
      sendResponse({ success: false, error: err?.message || "Unexpected error" });
    });

  return true; // async response
});
