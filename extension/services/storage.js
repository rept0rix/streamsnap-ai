/**
 * StreamSnap AI — Quota-aware storage layer.
 *
 * chrome.storage.local is capped at ~10MB without the unlimitedStorage
 * permission. The catalog stores a source image per product, so writing raw
 * frames here fills the quota within a few dozen scans and every subsequent
 * write fails silently. Everything persisted goes through this module, which
 * downscales images, caps the catalog, and evicts oldest-first on overflow.
 */

import { dataUrlToBlob } from "./frame_cache.js";

export const LIMITS = {
  /** Hard cap on catalog entries. */
  MAX_CATALOG_ITEMS: 200,
  /** Longest edge for a stored product thumbnail, in pixels. */
  THUMB_MAX_EDGE: 200,
  /** Longest edge for the stored full-frame snapshot. */
  SNAPSHOT_MAX_EDGE: 720,
  /** Stop writing and evict when local storage passes this many bytes. */
  STORAGE_SOFT_LIMIT_BYTES: 7 * 1024 * 1024
};

/**
 * Re-encode an image data URL down to a bounded size.
 * Returns null when the input cannot be decoded, so callers can degrade
 * gracefully instead of persisting a broken value.
 */
export async function downscaleDataUrl(dataUrl, maxEdge, quality = 0.72) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  try {
    const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let binary = "";
    const CHUNK = 0x8000; // avoid blowing the argument limit on large frames
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch (err) {
    console.warn("[StreamSnap] downscale failed:", err);
    return null;
  }
}

export async function getBytesInUse() {
  try {
    return await chrome.storage.local.getBytesInUse(null);
  } catch {
    return 0;
  }
}

/**
 * Trim the catalog until it fits both the item cap and the byte budget.
 * Entries are ordered newest-first, so eviction drops from the tail.
 */
export async function enforceCatalogBudget(catalog) {
  let trimmed = catalog.slice(0, LIMITS.MAX_CATALOG_ITEMS);

  let used = await getBytesInUse();
  while (used > LIMITS.STORAGE_SOFT_LIMIT_BYTES && trimmed.length > 20) {
    // Drop the oldest quarter, then re-measure.
    trimmed = trimmed.slice(0, Math.max(20, Math.floor(trimmed.length * 0.75)));
    await chrome.storage.local.set({ discoveredCatalog: trimmed });
    used = await getBytesInUse();
  }

  return trimmed;
}

/**
 * Write with an explicit failure path. chrome.storage.local.set rejects when
 * the quota is exceeded; without this the catalog silently stops updating.
 */
export async function safeSet(items) {
  try {
    await chrome.storage.local.set(items);
    return { ok: true };
  } catch (err) {
    console.error("[StreamSnap] storage write failed:", err);
    return { ok: false, error: err?.message || String(err) };
  }
}
