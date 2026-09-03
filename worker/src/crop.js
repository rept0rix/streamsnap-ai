/**
 * Tight JPEG crop from a Gemini/Workers-AI box_2d ([ymin, xmin, ymax, xmax]
 * on a 0–1000 scale).
 *
 * Workers have a tight CPU budget for pure-JS JPEG codecs, so we always
 * downscale the frame to ≤ MAX_EDGE before cropping. That is plenty for a
 * mobile thumbnail and for a Lens upload, and keeps decode+encode under budget.
 */

import { Buffer } from "node:buffer";
import * as jpegNs from "jpeg-js";

// jpeg-js encode() expects a Node Buffer global; Workers only expose it when
 // the module (or nodejs_compat) provides one.
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;

const jpeg = jpegNs.default ?? jpegNs;
const MAX_EDGE = 640;

function downscale(decoded, maxEdge) {
  const { width, height, data } = decoded;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale >= 0.999) return { width, height, data };
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const si = (sy * width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

export function cropJpegByBox(bytes, box, opts = {}) {
  if (!box || box.length < 4 || !bytes || bytes.length < 32) return null;
  if (typeof jpeg.decode !== "function" || typeof jpeg.encode !== "function") {
    console.log("[crop] jpeg-js missing", Object.keys(jpeg || {}));
    return null;
  }
  const margin = Number.isFinite(opts.margin) ? opts.margin : 0.04;
  const quality = Number.isFinite(opts.quality) ? opts.quality : 0.8;
  const minEdge = Number.isFinite(opts.minEdge) ? opts.minEdge : 24;
  const maxEdge = Number.isFinite(opts.maxEdge) ? opts.maxEdge : MAX_EDGE;

  let decoded;
  try {
    decoded = jpeg.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      useTArray: true,
      formatAsRGBA: true
    });
  } catch (err) {
    console.log("[crop] decode failed:", err?.message || err);
    return null;
  }
  if (!decoded?.width || !decoded?.height || !decoded?.data) return null;

  const frame = downscale(decoded, maxEdge);
  const { width, height, data } = frame;

  const [ymin, xmin, ymax, xmax] = box.map(Number);
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite) || ymax <= ymin || xmax <= xmin) {
    return null;
  }

  const x0 = Math.max(0, Math.floor((xmin / 1000 - margin) * width));
  const y0 = Math.max(0, Math.floor((ymin / 1000 - margin) * height));
  const x1 = Math.min(width, Math.ceil((xmax / 1000 + margin) * width));
  const y1 = Math.min(height, Math.ceil((ymax / 1000 + margin) * height));
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < minEdge || ch < minEdge) return null;

  const out = new Uint8Array(cw * ch * 4);
  for (let row = 0; row < ch; row++) {
    const src = ((y0 + row) * width + x0) * 4;
    out.set(data.subarray(src, src + cw * 4), row * cw * 4);
  }

  try {
    const encoded = jpeg.encode(
      { data: out, width: cw, height: ch },
      Math.max(40, Math.min(90, Math.round(quality * 100)))
    );
    return encoded?.data ? new Uint8Array(encoded.data) : null;
  } catch (err) {
    console.log("[crop] encode failed:", err?.message || err);
    return null;
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function cropToDataUrl(bytes, box, opts) {
  try {
    const crop = cropJpegByBox(bytes, box, opts);
    if (!crop) return null;
    return `data:image/jpeg;base64,${bytesToBase64(crop)}`;
  } catch (err) {
    console.log("[crop] dataUrl failed:", err?.message || err);
    return null;
  }
}
