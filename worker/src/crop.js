/**
 * Tight JPEG crop from a Gemini/Workers-AI box_2d ([ymin, xmin, ymax, xmax]
 * on a 0–1000 scale). Pure JS via jpeg-js — no canvas binding needed.
 *
 * Used to:
 *  - attach a per-product `sourceCrop` so the mobile card can show the product
 *    itself instead of the full TikTok chrome frame;
 *  - feed Google Lens a product-only image when Bright Data is configured
 *    (full-frame Lens is noisy on live-stream UI).
 */

import jpeg from "jpeg-js";

/**
 * @param {Uint8Array|ArrayBuffer} bytes  JPEG bytes of the full frame
 * @param {[number, number, number, number]|null} box
 * @param {{ margin?: number, quality?: number, minEdge?: number }} [opts]
 * @returns {Uint8Array|null} cropped JPEG, or null if the box/frame is unusable
 */
export function cropJpegByBox(bytes, box, opts = {}) {
  if (!box || box.length < 4 || !bytes || bytes.length < 32) return null;
  const margin = Number.isFinite(opts.margin) ? opts.margin : 0.04;
  const quality = Number.isFinite(opts.quality) ? opts.quality : 0.85;
  const minEdge = Number.isFinite(opts.minEdge) ? opts.minEdge : 24;

  let decoded;
  try {
    decoded = jpeg.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      useTArray: true,
      formatAsRGBA: true
    });
  } catch {
    return null;
  }

  const { width, height, data } = decoded;
  if (!width || !height || !data) return null;

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
    const dst = row * cw * 4;
    out.set(data.subarray(src, src + cw * 4), dst);
  }

  try {
    const encoded = jpeg.encode(
      { data: out, width: cw, height: ch },
      Math.max(40, Math.min(95, Math.round(quality * 100)))
    );
    return encoded?.data ? new Uint8Array(encoded.data) : null;
  } catch {
    return null;
  }
}

/** @returns {string|null} data:image/jpeg;base64,… */
export function cropToDataUrl(bytes, box, opts) {
  const crop = cropJpegByBox(bytes, box, opts);
  if (!crop) return null;
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < crop.length; i += chunk) {
    binary += String.fromCharCode(...crop.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}
