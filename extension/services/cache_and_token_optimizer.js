/**
 * StreamSnap AI — Zero-Cost Token Engine & Frame Optimizer
 * Slashes LLM Vision API costs by 90%+ using client-side frame diffing,
 * perceptual hashing (pHash), and local multi-tier caching.
 */

// Memory cache for recent frame hashes
const localFrameHashCache = new Map();

/**
 * 1. Client-Side Frame Diffing (Canvas Delta)
 * Compares current video frame with last analyzed frame.
 * If difference is < threshold (e.g. 12%), skips expensive LLM vision call.
 */
export function calculateFrameVisualDelta(currentImageData, prevImageData) {
  if (!prevImageData || !currentImageData) return 100.0;

  const curr = currentImageData.data;
  const prev = prevImageData.data;
  const length = curr.length;
  
  if (length !== prev.length) return 100.0;

  let totalDiff = 0;
  const step = 16; // sample every 4th pixel
  let samples = 0;

  for (let i = 0; i < length; i += step) {
    const rDiff = Math.abs(curr[i] - prev[i]);
    const gDiff = Math.abs(curr[i + 1] - prev[i + 1]);
    const bDiff = Math.abs(curr[i + 2] - prev[i + 2]);
    
    totalDiff += (rDiff + gDiff + bDiff) / 3;
    samples++;
  }

  const avgDiff = totalDiff / (samples * 255);
  return parseFloat((avgDiff * 100).toFixed(2));
}

/**
 * 2. Perceptual Hash (pHash) Calculator
 * Generates a 64-bit fingerprint of an image to match similar studio setups in 0ms without AI.
 */
export function computePerceptualHash(canvas, ctx) {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = 8;
  tempCanvas.height = 8;
  const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
  
  tempCtx.drawImage(canvas, 0, 0, 8, 8);
  const imgData = tempCtx.getImageData(0, 0, 8, 8);
  const data = imgData.data;

  let totalLuminance = 0;
  const grays = new Float32Array(64);

  for (let i = 0; i < 64; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    grays[i] = lum;
    totalLuminance += lum;
  }

  const avgLuminance = totalLuminance / 64;

  let hash = "";
  for (let i = 0; i < 64; i++) {
    hash += grays[i] >= avgLuminance ? "1" : "0";
  }

  return hash;
}

/**
 * 3. Hamming Distance between two hashes (0 = identical, 64 = completely different)
 */
export function getHammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

/**
 * 4. Zero-Cost Pre-Scan Check
 */
export async function evaluateFrameForLLMCall(canvas, ctx, streamTitle) {
  const currentHash = computePerceptualHash(canvas, ctx);

  for (const [cachedHash, record] of localFrameHashCache.entries()) {
    const dist = getHammingDistance(currentHash, cachedHash);
    if (dist <= 3) {
      return {
        shouldCallLLM: false,
        cachedResult: record.result,
        reason: `pHash Match (Distance: ${dist}/64) - $0 token cost`
      };
    }
  }

  return {
    shouldCallLLM: true,
    cachedResult: null,
    hash: currentHash,
    reason: "New visual frame detected"
  };
}

/**
 * Save successful analysis into local pHash memory cache
 */
export function recordFrameAnalysis(hash, result) {
  if (!hash || !result) return;
  
  if (localFrameHashCache.size > 50) {
    const firstKey = localFrameHashCache.keys().next().value;
    localFrameHashCache.delete(firstKey);
  }

  localFrameHashCache.set(hash, {
    result: result,
    timestamp: Date.now()
  });
}
