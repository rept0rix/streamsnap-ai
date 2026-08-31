/**
 * StreamSnap AI — MV3 Service Worker
 *
 * Responsibilities: tab capture, Gemini Vision analysis, detection reconciliation,
 * catalog persistence, cart, and analytics.
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
  affiliateTag: "streamsnap03-20"
};

const AUTO_SCAN_ALARM = "streamsnap-auto-scan";
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];

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

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await ensureDefaults();
  await syncAutoScanAlarm(settings.autoScanIntervalSec);
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
  const seconds = Number(intervalSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  const periodInMinutes = Math.max(0.5, seconds / 60);
  chrome.alarms.create(AUTO_SCAN_ALARM, { periodInMinutes });
  console.info(`[StreamSnap] auto-scan every ${(periodInMinutes * 60).toFixed(0)}s`);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTO_SCAN_ALARM) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { action: "TRIGGER_AUTO_SCAN" }).catch(() => {
    /* no content script on this tab — expected */
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.autoScanIntervalSec) {
    syncAutoScanAlarm(changes.autoScanIntervalSec.newValue);
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

  const process = (list, tier) =>
    (Array.isArray(list) ? list : [])
      .map((item) => {
        const resolved = resolveDetection(item);
        if (!resolved) return null;
        // null = the model did not report a confidence for this item.
        return { ...resolved, tier, confidence: normalizeConfidence(item) };
      })
      .filter((item) => {
        if (!item) return false;
        // Unknown confidence is shown, not hidden. A self-reported score from a
        // language model is a weak signal at best; it should never be the only
        // thing standing between the user and a real detection.
        if (item.confidence === null) return true;
        if (item.confidence >= minConfidence) return true;
        filtered += 1;
        return false;
      });

  out.exactMatches = process(raw.exactMatches, "exact");
  out.lookAlikes = process(raw.lookAlikes, "lookalike");
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

const FULL_FRAME_PROMPT = (streamTitle) => `You are StreamSnap AI, a visual commerce engine for live streams.
Analyze this video frame from a stream titled: "${streamTitle}".
Detect every prominent, distinct consumer product visible (fitness equipment, apparel, consumer tech, drinkware, accessories).

Rules:
- Only report products you can actually see. Do not guess at items that may be off-frame.
- Only include an "asin" if you are certain of the real Amazon ASIN. If you are not certain, omit the field entirely. Never invent one.
- Only include "price" if you are confident of the real current price. Otherwise omit it.
- Set "confidence" honestly between 0 and 1.
- Give each item a bounding box [ymin, xmin, ymax, xmax] normalized 0-1000.

Return JSON:
{
  "exactMatches": [
    {
      "title": "Specific product name including brand and model",
      "brand": "Brand",
      "confidence": 0.9,
      "detectionLabel": "Short label, e.g. Black smartwatch on wrist",
      "matchReason": "What you saw that identifies it",
      "box_2d": [380, 440, 420, 470]
    }
  ],
  "lookAlikes": [
    {
      "title": "Product category and description for a visually similar item",
      "similarityScore": 88,
      "detectionLabel": "Short label",
      "matchReason": "Why this is a style match rather than an exact one",
      "box_2d": [450, 310, 710, 390]
    }
  ]
}`;

const CROP_PROMPT = (streamTitle) => `You are StreamSnap AI, a visual search engine.
The user cropped one specific object from a live stream titled: "${streamTitle}".
Identify ONLY the object in this crop.

Rules:
- Only include an "asin" if you are certain of the real Amazon ASIN. Otherwise omit it. Never invent one.
- Only include "price" if you are confident of the real price. Otherwise omit it.
- Set "confidence" honestly between 0 and 1.

Return JSON with the same shape: { "exactMatches": [...], "lookAlikes": [...] }
Each entry needs: title, brand, confidence (or similarityScore), detectionLabel, matchReason.`;

async function callGemini(imageDataUrl, apiKey, prompt) {
  if (!apiKey) {
    throw new Error("No Gemini API key. Add one in the Setup tab.");
  }
  const cleanBase64 = imageDataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
  const body = JSON.stringify({
    contents: [
      {
        parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: cleanBase64 } }]
      }
    ],
    generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
  });

  let lastError = "";
  for (const model of GEMINI_MODELS) {
    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body
        }
      );
    } catch (networkErr) {
      lastError = `Network error: ${networkErr.message}`;
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("Gemini rejected the API key. Check it in the Setup tab.");
    }
    if (response.status === 429) {
      throw new Error("Gemini rate limit reached. Wait a moment and scan again.");
    }
    if (!response.ok) {
      lastError = `${model} returned ${response.status}`;
      continue;
    }

    const json = await response.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastError = `${model} returned an empty response`;
      continue;
    }

    try {
      return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim());
    } catch {
      lastError = `${model} returned malformed JSON`;
    }
  }

  throw new Error(lastError || "Gemini analysis failed.");
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

async function publishScanError(message) {
  await safeSet({ isScanning: false, lastScanError: message });
  broadcast({ action: "SCAN_FAILED", error: message });
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
    raw = await callGemini(
      imageDataUrl,
      apiKey,
      isCrop ? CROP_PROMPT(streamKey || "Live Stream") : FULL_FRAME_PROMPT(streamKey || "Live Stream")
    );
    if (hash) recordFrame(hash, raw, streamKey);
  }

  const results = reconcileResults(raw, minConfidence);

  // Attach a bounded thumbnail per item: the model's box for full frames,
  // the user's selection for crops.
  await Promise.all(
    [...results.exactMatches, ...results.lookAlikes].map(async (item) => {
      const source = isCrop
        ? imageDataUrl
        : (await extractCropFromBox(imageDataUrl, item.box_2d)) || imageDataUrl;
      item.thumbnail = await downscaleDataUrl(source, LIMITS.THUMB_MAX_EDGE);
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
    try {
      const data = await runAnalysis({
        imageDataUrl: message.imageBase64,
        apiKey: message.apiKey,
        streamContext: message.streamContext,
        mode: "frame"
      });
      return { success: true, data };
    } catch (err) {
      const reason = err?.message || "Scan failed.";
      await publishScanError(reason);
      return { success: false, error: reason };
    }
  },

  async ANALYZE_CROPPED_IMAGE(message) {
    try {
      const data = await runAnalysis({
        imageDataUrl: message.croppedImage,
        apiKey: message.apiKey,
        streamContext: message.streamContext,
        mode: "crop"
      });
      return { success: true, data };
    } catch (err) {
      const reason = err?.message || "Crop analysis failed.";
      await publishScanError(reason);
      return { success: false, error: reason };
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
  }
};

// Keyboard shortcut. The old chrome.action.onClicked handler never fired,
// because setPanelBehavior({ openPanelOnActionClick: true }) consumes the click.
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "scan-active-stream") return;
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
