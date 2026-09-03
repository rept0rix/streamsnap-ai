/**
 * StreamSnap Worker — Amazon catalog lookup.
 *
 * The vision model only tells us *what* is in the frame ("Apple Watch Series 8").
 * To show a real "Amazon Match" (ASIN, listing image, live price) we search
 * amazon.com for that title and keep the best organic result whose listing title
 * actually overlaps the detected title. Anything that does not overlap enough is
 * treated as "no verified match" so the UI never presents a random listing (or a
 * random stock photo) as the product that was seen in the video.
 *
 * No third-party API is involved: this is a plain search-page fetch parsed with
 * regexes that only depend on the long-lived `data-asin` / `s-image` /
 * `a-offscreen` markup. Results are cached in KV so repeat sightings of the same
 * product across users cost nothing.
 */

const ASIN_RE = /^B0[A-Z0-9]{8}$/;

const RESULT_SPLIT_RE = /(?=<div[^>]+data-component-type="s-search-result")/;
const ASIN_ATTR_RE = /data-asin="([A-Z0-9]{10})"/;
const IMG_TAG_RE = /<img[^>]+class="s-image"[^>]*>/;
const IMG_SRC_RE = /\ssrc="([^"]+)"/;
const IMG_ALT_RE = /\salt="([^"]*)"/;
const PRICE_RE = /class="a-offscreen">\s*([^<]+?)\s*</;
const SPONSORED_RE = /AdHolder|puis-sponsored-label|s-sponsored-label|>\s*Sponsored\s*</;
const CAPTCHA_RE = /validateCaptcha|Robot Check|api-services-support@amazon\.com|Enter the characters you see below/i;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "a", "an", "of", "to", "in", "on", "by", "or",
  "new", "pack", "set", "pcs", "piece", "pieces", "color", "colour", "size",
  "men", "mens", "women", "womens", "unisex", "kids", "adult", "adults",
  "style", "edition", "version", "original", "official", "genuine", "brand"
]);

const CACHE_TTL_HIT_SECONDS = 60 * 60 * 24 * 3;
const CACHE_TTL_MISS_SECONDS = 60 * 60;
const FETCH_TIMEOUT_MS = 6500;

// Amazon serves a lean, stable results page to phones; it is roughly half the
// size of the desktop markup and uses the same data-asin / s-image structure.
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function decodeEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens that carry meaning for matching: lowercased alphanumerics, minus filler. */
export function matchTokens(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9+]+/)
    .filter((t) => (t.length >= 2 || /^\d$/.test(t)) && !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

// "45mm", "40oz", "128gb": a size/capacity variant, not a different product.
const SIZE_TOKEN_RE = /^\d+(\.\d+)?(mm|cm|m|in|inch|ft|oz|ml|l|lb|lbs|kg|g|gb|tb|w|v|mah|hz|k|x|pk|ct|pcs)$/;

/**
 * Fraction (0–1) of the detected title's meaningful tokens that appear in the
 * listing title. Word tokens accept simple plural / prefix forms ("earbud" ~
 * "earbuds"); tokens containing digits must match exactly. A missing model
 * number ("Series 9" vs "Series 8", "XM4" vs "XM5") caps the score below the
 * verification threshold, because that is a different product, whereas a
 * missing size variant ("45mm") is only an ordinary miss.
 */
export function scoreTitleMatch(query, candidateTitle) {
  const q = matchTokens(query);
  if (q.length === 0) return 0;
  const c = matchTokens(candidateTitle);
  if (c.length === 0) return 0;

  let hits = 0;
  let modelNumberMissing = false;
  for (const token of q) {
    const hasDigit = /\d/.test(token);
    const found = c.some((ct) => {
      if (ct === token) return true;
      if (hasDigit) return false;
      if (token.length < 4) return false;
      return ct.startsWith(token) || token.startsWith(ct);
    });
    if (found) hits++;
    else if (hasDigit && !SIZE_TOKEN_RE.test(token)) modelNumberMissing = true;
  }
  const score = hits / q.length;
  return modelNumberMissing ? Math.min(score, 0.45) : score;
}

/** Ask for the 400px listing image instead of the tiny search-grid thumbnail. */
export function upscaleAmazonImage(url) {
  if (typeof url !== "string" || !url) return null;
  return url.replace(/\._[A-Za-z0-9_,]+_\.(jpg|jpeg|png|webp)$/i, "._AC_SL400_.$1");
}

export function buildAmazonSearchUrl(query, domain = "www.amazon.com") {
  return `https://${domain}/s?k=${encodeURIComponent(String(query).trim())}`;
}

/**
 * Parse an Amazon search results page into listing summaries, in page order.
 * Returns [] for CAPTCHA / block pages and anything without recognisable results.
 */
export function parseAmazonSearchHtml(html, { limit = 10 } = {}) {
  const text = String(html || "");
  if (!text || CAPTCHA_RE.test(text.slice(0, 20000))) return [];

  const blocks = text.split(RESULT_SPLIT_RE).slice(1);
  const results = [];
  const seen = new Set();

  for (const block of blocks) {
    if (results.length >= limit) break;

    const asin = block.match(ASIN_ATTR_RE)?.[1]?.toUpperCase();
    if (!asin || !ASIN_RE.test(asin) || seen.has(asin)) continue;

    const img = block.match(IMG_TAG_RE)?.[0] || "";
    const imageUrl = img.match(IMG_SRC_RE)?.[1] || null;
    const title = decodeEntities(img.match(IMG_ALT_RE)?.[1] || "");
    if (!title) continue;

    const priceText = decodeEntities(block.match(PRICE_RE)?.[1] || "");
    const priceValue = parseFloat(priceText.replace(/[^0-9.]/g, ""));

    seen.add(asin);
    results.push({
      asin,
      title,
      url: `https://www.amazon.com/dp/${asin}`,
      imageUrl: upscaleAmazonImage(imageUrl),
      thumbnailUrl: imageUrl,
      price: /^\$|USD/.test(priceText) && Number.isFinite(priceValue) ? priceText : null,
      priceValue: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
      sponsored: SPONSORED_RE.test(block)
    });
  }

  return results;
}

/**
 * Choose the listing that best matches the detected title. Organic results win
 * ties over sponsored ones; the score must clear `minScore` or nothing is
 * returned — a weak match is worse than an honest "search Amazon" link.
 */
export function pickBestAmazonMatch(query, results, { minScore = 0.5 } = {}) {
  let best = null;
  for (const [index, result] of (results || []).entries()) {
    const score = scoreTitleMatch(query, result.title);
    if (score < minScore) continue;
    // Small position bias so equal-score results keep Amazon's own ranking.
    const adjusted = score - index * 0.01 - (result.sponsored ? 0.05 : 0);
    if (!best || adjusted > best.adjusted) {
      best = { ...result, matchScore: Math.round(score * 100), adjusted };
    }
  }
  if (!best) return null;
  const { adjusted, ...match } = best;
  return match;
}

function cacheKey(query) {
  return `amz:${matchTokens(query).sort().join(" ").slice(0, 200)}`;
}

/**
 * Look up a detected product title on Amazon. Resolves to a verified listing
 * ({ asin, title, url, imageUrl, price, priceValue, matchScore }) or null.
 * Never throws: any network / block / parse failure is a null match.
 */
export async function lookupAmazonProduct(query, env, { fetchImpl = fetch } = {}) {
  const cleaned = String(query || "").trim();
  if (matchTokens(cleaned).length === 0) return null;

  const key = cacheKey(cleaned);
  if (env?.CACHE) {
    try {
      const cached = await env.CACHE.get(key, "json");
      if (cached && typeof cached === "object") {
        return cached.match || null;
      }
    } catch {}
  }

  let match = null;
  try {
    const response = await fetchImpl(buildAmazonSearchUrl(cleaned), {
      headers: {
        "User-Agent": MOBILE_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (response.ok) {
      const html = await response.text();
      match = pickBestAmazonMatch(cleaned, parseAmazonSearchHtml(html));
    }
  } catch (err) {
    console.log("[amazon] lookup failed:", err?.message || err);
  }

  if (env?.CACHE) {
    const ttl = match ? CACHE_TTL_HIT_SECONDS : CACHE_TTL_MISS_SECONDS;
    try {
      await env.CACHE.put(key, JSON.stringify({ match }), { expirationTtl: ttl });
    } catch {}
  }

  return match;
}
