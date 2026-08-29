/**
 * StreamSnap AI — Frame Cache & Token Optimizer
 *
 * Cuts Gemini Vision spend by fingerprinting each frame with a perceptual hash
 * and reusing the previous result when the scene has not meaningfully changed.
 * A talking-head stream can hold the same visual composition for minutes, so
 * this removes the large majority of redundant API calls.
 *
 * Runs inside the MV3 service worker: uses OffscreenCanvas / createImageBitmap,
 * never `document`.
 */

const HASH_SIZE = 8; // 8x8 => 64-bit fingerprint
const MAX_ENTRIES = 40;
const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_DISTANCE = 4; // out of 64 bits

/** hash -> { result, timestamp, streamKey } */
const cache = new Map();

export function dataUrlToBlob(dataUrl) {
  const clean = String(dataUrl || "").replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

/**
 * Average-hash fingerprint of an image, computed in the service worker.
 * Returns a 64-character binary string, or null if the image cannot be decoded.
 */
export async function computePerceptualHash(imageDataUrl) {
  try {
    const bitmap = await createImageBitmap(dataUrlToBlob(imageDataUrl));
    const canvas = new OffscreenCanvas(HASH_SIZE, HASH_SIZE);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, HASH_SIZE, HASH_SIZE);
    bitmap.close();

    const { data } = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE);
    const pixels = HASH_SIZE * HASH_SIZE;
    const grays = new Float32Array(pixels);
    let total = 0;

    for (let i = 0; i < pixels; i++) {
      const lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      grays[i] = lum;
      total += lum;
    }

    const average = total / pixels;
    let hash = "";
    for (let i = 0; i < pixels; i++) hash += grays[i] >= average ? "1" : "0";
    return hash;
  } catch (err) {
    console.warn("[StreamSnap] pHash failed:", err);
    return null;
  }
}

/** Number of differing bits between two fingerprints. 0 = identical. */
export function getHammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) distance++;
  }
  return distance;
}

function evictStale() {
  const now = Date.now();
  for (const [hash, record] of cache) {
    if (now - record.timestamp > MAX_AGE_MS) cache.delete(hash);
  }
  while (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

/**
 * Look for a cached analysis of a visually equivalent frame.
 * Returns { hash, cachedResult, distance } — cachedResult is null on a miss.
 */
export async function lookupFrame(imageDataUrl, streamKey = "", maxDistance = DEFAULT_MAX_DISTANCE) {
  const hash = await computePerceptualHash(imageDataUrl);
  if (!hash) return { hash: null, cachedResult: null, distance: null };

  evictStale();

  let best = null;
  for (const [cachedHash, record] of cache) {
    if (streamKey && record.streamKey && record.streamKey !== streamKey) continue;
    const distance = getHammingDistance(hash, cachedHash);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { distance, result: record.result };
    }
  }

  if (best) {
    return { hash, cachedResult: best.result, distance: best.distance };
  }
  return { hash, cachedResult: null, distance: null };
}

/** Store a successful analysis against its frame fingerprint. */
export function recordFrame(hash, result, streamKey = "") {
  if (!hash || !result) return;
  cache.set(hash, { result, timestamp: Date.now(), streamKey });
  evictStale();
}

export function clearFrameCache() {
  cache.clear();
}

export function getFrameCacheSize() {
  return cache.size;
}
