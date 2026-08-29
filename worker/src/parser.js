/**
 * StreamSnap Worker — Google Lens result parser.
 *
 * Turns a Bright Data Lens response into normalized products.
 *
 * Design note: the exact JSON shape Bright Data returns for Lens is not
 * publicly documented and has changed between their SERP endpoints. Rather than
 * assume one shape, this parser walks the response for anything that looks like
 * a result object and reads a set of plausible field aliases. That keeps the
 * Worker working through upstream schema drift, and `collectRawShape` gives us
 * the real field names from the first live call so we can tighten it later.
 */

const ASIN_RE = /^B0[A-Z0-9]{8}$/;

/** Fields that have held the product title across Bright Data's SERP shapes. */
const TITLE_KEYS = ["title", "name", "product_title", "text", "heading"];
const LINK_KEYS = ["link", "url", "page_url", "product_link", "source_url", "href"];
const IMAGE_KEYS = ["image", "image_url", "thumbnail", "thumbnail_url", "img", "image_link"];
const PRICE_KEYS = ["price", "current_price", "product_price", "offer_price", "price_value"];
const SOURCE_KEYS = ["source", "merchant", "seller", "domain", "store", "site"];
const CURRENCY_KEYS = ["currency", "price_currency"];

/** Arrays under these keys hold results; anything else is walked generically. */
const RESULT_CONTAINERS = [
  "products",
  "visual_matches",
  "visualMatches",
  "exact_matches",
  "exactMatches",
  "shopping_results",
  "organic",
  "results",
  "items",
  "matches"
];

function firstString(obj, keys) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Parse a price that may arrive as a number, "$49.99", "USD 49.99",
 * "49,99 €", or a nested { value, currency } object.
 */
export function parsePrice(raw) {
  if (raw == null) return { price: null, currency: null };

  if (typeof raw === "number") {
    return { price: Number.isFinite(raw) && raw > 0 ? raw : null, currency: null };
  }

  if (typeof raw === "object") {
    const nested = firstString(raw, ["value", "amount", "raw", "displayed_price"]);
    const currency = firstString(raw, CURRENCY_KEYS);
    const parsed = parsePrice(nested ?? raw.value ?? null);
    return { price: parsed.price, currency: parsed.currency || currency };
  }

  if (typeof raw !== "string") return { price: null, currency: null };

  const text = raw.trim();
  let currency = null;
  if (/\$|USD/i.test(text)) currency = "USD";
  else if (/€|EUR/i.test(text)) currency = "EUR";
  else if (/£|GBP/i.test(text)) currency = "GBP";
  else if (/₪|ILS|NIS/i.test(text)) currency = "ILS";

  // Strip currency symbols and letters, then normalise separators. Handles both
  // "1,299.00" (comma thousands) and "1.299,00" (European style).
  const numeric = text.replace(/[^\d.,]/g, "");
  if (!numeric) return { price: null, currency };

  let normalized;
  const lastComma = numeric.lastIndexOf(",");
  const lastDot = numeric.lastIndexOf(".");
  if (lastComma > lastDot) {
    normalized = numeric.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = numeric.replace(/,/g, "");
  }

  const value = parseFloat(normalized);
  return { price: Number.isFinite(value) && value > 0 ? value : null, currency };
}

/** Extract an ASIN from any Amazon URL form. */
export function extractAsin(url) {
  if (typeof url !== "string") return null;
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const asin = match[1].toUpperCase();
      if (ASIN_RE.test(asin)) return asin;
    }
  }
  return null;
}

/** True for a URL on an Amazon retail domain (not affiliate or image CDNs). */
export function isAmazonUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /(^|\.)amazon\.(com|co\.uk|de|fr|it|es|ca|com\.mx|co\.jp|in|com\.au|nl|se|pl|sa|ae|com\.br|sg|com\.tr)$/.test(
      host
    );
  } catch {
    return false;
  }
}

function looksLikeResult(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const hasTitle = TITLE_KEYS.some((k) => typeof node[k] === "string" && node[k].trim());
  const hasLink = LINK_KEYS.some((k) => typeof node[k] === "string" && node[k].startsWith("http"));
  return hasTitle && hasLink;
}

function normalizeNode(node) {
  const url = firstString(node, LINK_KEYS);
  const title = firstString(node, TITLE_KEYS);
  if (!url || !title) return null;

  const { price, currency } = parsePrice(
    PRICE_KEYS.map((k) => node[k]).find((v) => v != null) ?? null
  );

  const asin = extractAsin(url);
  const amazon = isAmazonUrl(url);

  return {
    title,
    url,
    asin,
    image: firstString(node, IMAGE_KEYS),
    price,
    currency,
    source: firstString(node, SOURCE_KEYS) || (amazon ? "Amazon" : hostOf(url)),
    isAmazon: amazon,
    // Only an Amazon URL carrying a real ASIN is safe to deep link.
    verified: Boolean(amazon && asin)
  };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Walk the response and collect every node that looks like a result.
 * Prefers known containers but falls back to a bounded generic walk.
 */
function collectNodes(payload, depth = 0, out = []) {
  if (!payload || typeof payload !== "object" || depth > 6 || out.length > 300) return out;

  if (Array.isArray(payload)) {
    for (const item of payload) collectNodes(item, depth + 1, out);
    return out;
  }

  if (looksLikeResult(payload)) out.push(payload);

  for (const [key, value] of Object.entries(payload)) {
    if (!value || typeof value !== "object") continue;
    // Known containers get priority but everything is still walked.
    const nextDepth = RESULT_CONTAINERS.includes(key) ? depth : depth + 1;
    collectNodes(value, nextDepth, out);
  }

  return out;
}

/**
 * Parse a Lens response into { amazon, others }.
 *
 * `amazon` holds only entries with a real ASIN, ordered by result position and
 * then by whether a price was found — those are the ones worth deep linking.
 */
export function parseLensResponse(payload, { limit = 8 } = {}) {
  const nodes = collectNodes(payload);
  const seen = new Set();
  const amazon = [];
  const others = [];

  for (const node of nodes) {
    const product = normalizeNode(node);
    if (!product) continue;

    const key = product.asin || product.url;
    if (seen.has(key)) continue;
    seen.add(key);

    if (product.verified) amazon.push(product);
    else if (!product.isAmazon) others.push(product);
    // Amazon URLs without a resolvable ASIN are dropped: they would produce
    // exactly the dead links this whole design exists to prevent.
  }

  const score = (p) => (p.price ? 0 : 1);
  amazon.sort((a, b) => score(a) - score(b));

  return {
    amazon: amazon.slice(0, limit),
    others: others.slice(0, limit)
  };
}

/**
 * Summarize the shape of a response for logging. Lets us learn the real field
 * names from the first live calls without dumping full payloads.
 */
export function collectRawShape(payload, depth = 0) {
  if (depth > 3 || !payload || typeof payload !== "object") return typeof payload;
  if (Array.isArray(payload)) {
    return payload.length ? [collectRawShape(payload[0], depth + 1)] : [];
  }
  const shape = {};
  for (const [key, value] of Object.entries(payload).slice(0, 25)) {
    shape[key] = collectRawShape(value, depth + 1);
  }
  return shape;
}
