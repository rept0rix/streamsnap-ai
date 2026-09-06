/**
 * StreamSnap AI — Lens Resolution Worker
 *
 * Sits between the extension and Bright Data's Google Lens API.
 *
 * Why a Worker exists at all:
 *  1. The Bright Data key cannot ship inside the extension — anyone could
 *     extract it from the bundle and burn the quota.
 *  2. Google Lens fetches the query image over HTTP, so the crop needs a
 *     public URL for a few seconds. The Worker hosts it from R2 and deletes it.
 *  3. Caching identical crops server-side means repeat scans across all users
 *     cost nothing.
 *
 * Endpoints:
 *   POST /resolve   { image, installId }  -> { products, others, cached }
 *   GET  /img/:key                        -> the temporary crop (for Google)
 *   GET  /health                          -> liveness
 */

import { parseLensResponse, collectRawShape } from "./parser.js";
import { detectProducts } from "./vision.js";
import { lookupAmazonProduct, scoreTitleMatch } from "./amazon_lookup.js";
import { cropJpegByBox, cropToDataUrl } from "./crop.js";
import { handleAuthRoute } from "./routes_auth.js";
import { handleAdminRoute } from "./routes_admin.js";
import { handleSyncRoute } from "./routes_sync.js";
import { getCurrentUser } from "./auth.js";

const LIMITS = {
  MAX_IMAGE_BYTES: 3 * 1024 * 1024,
  PER_HOUR: 60,
  PER_DAY: 400,
  IMAGE_TTL_SECONDS: 300, // Google fetches within seconds; 5 min is generous
  CACHE_TTL_SECONDS: 60 * 60 * 24 * 7,
  UPSTREAM_TIMEOUT_MS: 20000
};

/**
 * The oldest extension build still allowed to run. Bump this to force every
 * client below it into a hard "update required" gate. Overridable at runtime
 * via the MIN_EXTENSION_VERSION var in wrangler.toml so a forced update does
 * not require a code deploy.
 */
const FALLBACK_MIN_EXTENSION_VERSION = "1.6.0";
const LATEST_EXTENSION_VERSION = "1.6.0";

export function minExtensionVersion(env) {
  const raw = String(env?.MIN_EXTENSION_VERSION || "").trim();
  return /^\d+\.\d+\.\d+$/.test(raw) ? raw : FALLBACK_MIN_EXTENSION_VERSION;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return preflight(request, env);
    if (url.pathname === "/health") return json({ ok: true }, 200, request, env);

    // Version gate feed. The extension polls this on open and hard-blocks itself
    // when its installed version is older than minVersion. Kept public and
    // unauthenticated so the gate works even before sign-in.
    if (url.pathname === "/version") {
      return json(
        {
          ok: true,
          minVersion: minExtensionVersion(env),
          latestVersion: LATEST_EXTENSION_VERSION,
          updateUrl: "https://streamsnap.online"
        },
        200,
        request,
        env
      );
    }

    if (url.pathname === "/") {
      return json({
        name: "StreamSnap AI — Lens Resolution Worker & Platform API",
        status: "Operational",
        version: LATEST_EXTENSION_VERSION,
        minVersion: minExtensionVersion(env),
        website: "https://streamsnap.online",
        endpoints: {
          health: "/health",
          version: "/version",
          auth: "/auth/start",
          me: "/auth/me",
          resolve: "POST /resolve",
          admin: "/api/admin/stats"
        }
      }, 200, request, env);
    }

    if (
      url.pathname.startsWith("/sync/") ||
      url.pathname.startsWith("/auth/device") ||
      url.pathname.startsWith("/creator/gear")
    ) {
      const response = await handleSyncRoute(request, env, url, json);
      if (response) return response;
    }

    if (
      url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/account") ||
      url.pathname.startsWith("/user/") ||
      url.pathname.startsWith("/creator/") ||
      url.pathname.startsWith("/billing/")
    ) {
      const response = await handleAuthRoute(request, env, url, json);
      if (response) return response;
    }

    if (url.pathname.startsWith("/api/admin")) {
      const response = await handleAdminRoute(request, env, url, json);
      if (response) return response;
    }

    if (url.pathname.startsWith("/img/")) {
      return serveImage(url.pathname.slice(5), env);
    }

    if (url.pathname === "/resolve" && request.method === "POST") {
      return handleResolve(request, env, ctx);
    }

    if (url.pathname === "/resolve-url" && request.method === "POST") {
      return handleResolveUrl(request, env, ctx);
    }

    return json({ ok: false, error: "Not found" }, 404, request, env);
  }
};

// ---------------------------------------------------------------------------
// CORS
//
// The extension's chrome-extension:// origin is only known once it is published,
// so ALLOWED_ORIGINS is configurable. Origin is not an auth boundary here —
// anyone can forge it — so rate limiting is keyed on the install ID instead.
// ---------------------------------------------------------------------------

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const base = {
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Gemini-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };

  // The website calls /auth/me and /auth/logout with credentials: "include",
  // which the browser only honours when the response names one exact origin and
  // sets Allow-Credentials. A wildcard is rejected outright in that mode, and
  // echoing an *unlisted* origin would let any site read a signed-in session.
  if (origin && (allowed.includes(origin) || origin.startsWith("chrome-extension://"))) {
    return {
      ...base,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true"
    };
  }

  // No allowlist configured yet: permit anonymous cross-origin reads for local
  // development, but never with credentials attached.
  if (allowed.length === 0) {
    return { ...base, "Access-Control-Allow-Origin": origin || "*" };
  }

  // Unlisted origin: omit the header entirely so the browser blocks it, rather
  // than quietly answering some other origin's name.
  return base;
}

function preflight(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function json(body, status, request, env, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env),
      ...extraHeaders
    }
  });
}

// ---------------------------------------------------------------------------
// Rate limiting — fixed windows in KV, keyed on install ID.
// ---------------------------------------------------------------------------

async function checkRateLimit(installId, env) {
  if (!env.CACHE) return { allowed: true };

  const now = Date.now();
  const windows = [
    { key: `rl:h:${installId}:${Math.floor(now / 3600000)}`, cap: LIMITS.PER_HOUR, ttl: 3700 },
    { key: `rl:d:${installId}:${Math.floor(now / 86400000)}`, cap: LIMITS.PER_DAY, ttl: 90000 }
  ];

  for (const window of windows) {
    const current = parseInt((await env.CACHE.get(window.key)) || "0", 10);
    if (current >= window.cap) {
      return {
        allowed: false,
        error: `Rate limit reached (${window.cap} scans). Try again later.`
      };
    }
  }

  // Incremented after the caps pass. A race here can overshoot slightly under
  // heavy concurrency from one install, which is an acceptable trade for
  // avoiding a durable object on the free tier.
  await Promise.all(
    windows.map((w) =>
      env.CACHE.get(w.key).then((v) =>
        env.CACHE.put(w.key, String(parseInt(v || "0", 10) + 1), { expirationTtl: w.ttl })
      )
    )
  );

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Temporary image hosting
// ---------------------------------------------------------------------------

async function serveImage(key, env) {
  if (!env.IMAGES || !/^[a-f0-9]{32,64}$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }
  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=300"
    }
  });
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeDataUrl(dataUrl) {
  const base64 = String(dataUrl || "").replace(/^data:image\/[a-z+]+;base64,/i, "");
  if (!base64) throw new Error("Empty image payload");

  const binary = atob(base64);
  if (binary.length > LIMITS.MAX_IMAGE_BYTES) {
    throw new Error("Image too large");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Bright Data
// ---------------------------------------------------------------------------

async function callLens(imageUrl, env) {
  const lensUrl =
    `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}` +
    `&brd_json=1&brd_lens=products&hl=en&gl=us`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIMITS.UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.BRIGHTDATA_API_KEY}`
      },
      body: JSON.stringify({
        zone: env.BRIGHTDATA_ZONE,
        url: lensUrl,
        format: "raw"
      }),
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Bright Data ${response.status}: ${text.slice(0, 200)}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Lens returned a non-JSON response");
    }
  } finally {
    clearTimeout(timeout);
  }
}

function stripSourceCrops(result) {
  const clean = (list) =>
    (list || []).map(({ sourceCrop, ...rest }) => rest);
  const amazon = clean(result.amazon);
  const others = clean(result.others);
  return {
    ...result,
    amazon,
    others,
    products: [...amazon, ...others]
  };
}

function reattachSourceCrops(bytes, result) {
  const attach = (list) =>
    (list || []).map((p) => ({
      ...p,
      sourceCrop: Array.isArray(p.box_2d) ? cropToDataUrl(bytes, p.box_2d) : p.sourceCrop || null
    }));
  const amazon = attach(result.amazon);
  const others = attach(result.others);
  return {
    ...result,
    amazon,
    others,
    products: [...amazon, ...others],
    count: amazon.length + others.length
  };
}

const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", ILS: "₪" };

/**
 * Lens products carry a numeric price and an `image` field. Clients (mobile,
 * extension) read `imageUrl` / `thumbnail` and a display-ready `price` string,
 * so publish both shapes.
 */
function normalizeLensProduct(p) {
  const symbol = CURRENCY_SYMBOLS[p.currency] || (p.currency ? `${p.currency} ` : "$");
  return {
    ...p,
    imageUrl: p.image || null,
    thumbnail: p.image || null,
    priceValue: typeof p.price === "number" ? p.price : null,
    price: typeof p.price === "number" ? `${symbol}${p.price.toFixed(2)}` : null,
    priceEstimated: false
  };
}

/**
 * Workers AI path: name + locate products in the frame, then resolve each
 * detection to a real Amazon listing (ASIN, catalog image, live price). Items
 * whose listing title genuinely overlaps the detection go to `amazon`
 * (verified); the rest stay in `others` with a plain search link and no image,
 * so the client never shows a random picture as the "match".
 */
async function resolveWithVision(bytes, env, options = {}) {
  const { videoTitle, detections, model, rawText } = await detectProducts(env, bytes, options);

  let videoUrl = "https://www.tiktok.com";
  const creatorMatch = videoTitle.match(/@([a-zA-Z0-9._]+)/);
  if (creatorMatch) {
    videoUrl = `https://www.tiktok.com/@${creatorMatch[1]}`;
  } else if (videoTitle) {
    videoUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(videoTitle)}`;
  }

  const lookups = await Promise.all(
    detections.map((d) => {
      const brandMissing = d.brand && !d.title.toLowerCase().includes(d.brand.toLowerCase());
      return lookupAmazonProduct(brandMissing ? `${d.brand} ${d.title}` : d.title, env);
    })
  );

  const amazon = [];
  const others = [];
  const seenAsins = new Set();

  detections.forEach((d, i) => {
    const match = lookups[i];
    if (match?.asin && seenAsins.has(match.asin)) return;

    const estimated = d.estimatedPrice != null ? `$${d.estimatedPrice.toFixed(2)}` : null;
    // Per-product crop so the mobile card can show the object itself, not the
    // full stream chrome. Failure is fine — the client falls back to the frame.
    const sourceCrop = d.box_2d ? cropToDataUrl(bytes, d.box_2d) : null;
    const base = {
      title: d.title,
      brand: d.brand,
      confidence: d.confidence,
      matchReason: d.matchReason || `Spotted ${d.title} in the video`,
      box_2d: d.box_2d,
      sourceCrop,
      source: "TikTok / Video",
      videoTitle: videoTitle || "TikTok Video",
      videoUrl
    };

    if (match?.asin) {
      seenAsins.add(match.asin);
      amazon.push({
        ...base,
        asin: match.asin,
        url: match.url,
        matchedTitle: match.title,
        matchScore: match.matchScore,
        image: match.imageUrl,
        imageUrl: match.imageUrl,
        thumbnail: match.imageUrl,
        price: match.price || estimated,
        priceValue: match.priceValue ?? d.estimatedPrice,
        priceEstimated: !match.price,
        isAmazon: true,
        verified: true
      });
    } else {
      others.push({
        ...base,
        asin: null,
        url: `https://www.amazon.com/s?k=${encodeURIComponent(d.title)}`,
        matchedTitle: null,
        matchScore: 0,
        image: null,
        imageUrl: null,
        thumbnail: null,
        price: estimated,
        priceValue: d.estimatedPrice,
        priceEstimated: estimated != null,
        isAmazon: false,
        verified: false
      });
    }
  });

  return { amazon, others, detections, model, rawText };
}

/**
 * When Bright Data is configured, run Lens on each product crop (not the full
 * TikTok frame). A Lens Amazon hit that overlaps the detection title upgrades
 * an unverified "Best Guess" — or replaces a weaker text match. Caps at
 * MAX_LENS_CROPS to protect the free 5K/month quota.
 */
const MAX_LENS_CROPS = 2;

async function enrichWithLensCrops(bytes, amazon, others, env, ctx) {
  if (!env.IMAGES || !env.PUBLIC_BASE_URL) return { amazon, others, lensUsed: 0 };

  const pool = [...amazon, ...others]
    .filter((p) => Array.isArray(p.box_2d) && p.box_2d.length === 4)
    // Prefer unverified detections — those benefit most from visual search.
    .sort((a, b) => Number(Boolean(a.verified)) - Number(Boolean(b.verified)))
    .slice(0, MAX_LENS_CROPS);

  if (!pool.length) return { amazon, others, lensUsed: 0 };

  let lensUsed = 0;
  const seenAsins = new Set(amazon.map((p) => p.asin).filter(Boolean));
  const upgraded = new Map(); // title key → Lens product

  for (const product of pool) {
    const cropBytes = cropJpegByBox(bytes, product.box_2d);
    if (!cropBytes) continue;

    const cropHash = await sha256Hex(cropBytes);
    try {
      await env.IMAGES.put(cropHash, cropBytes, {
        httpMetadata: { contentType: "image/jpeg" }
      });
      const lensUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/img/${cropHash}`;

      let payload;
      try {
        payload = await callLens(lensUrl, env);
        lensUsed += 1;
      } catch (err) {
        console.log("[resolve] lens crop failed:", err?.message || err);
        ctx.waitUntil(env.IMAGES.delete(cropHash));
        continue;
      }
      ctx.waitUntil(env.IMAGES.delete(cropHash));

      const lens = parseLensResponse(payload);
      const best = (lens.amazon || [])
        .map((item) => ({ item, score: scoreTitleMatch(product.title, item.title || "") }))
        .filter((x) => x.score >= 0.5 && x.item?.asin)
        .sort((a, b) => b.score - a.score)[0];

      if (!best) continue;
      if (seenAsins.has(best.item.asin) && product.asin !== best.item.asin) continue;

      upgraded.set(product.title, {
        ...product,
        ...normalizeLensProduct(best.item),
        title: product.title,
        brand: product.brand,
        confidence: product.confidence,
        matchReason: product.matchReason,
        box_2d: product.box_2d,
        sourceCrop: product.sourceCrop,
        matchedTitle: best.item.title,
        matchScore: Math.round(best.score * 100),
        videoTitle: product.videoTitle,
        videoUrl: product.videoUrl,
        source: product.source,
        verified: true,
        isAmazon: true,
        priceEstimated: false
      });
      seenAsins.add(best.item.asin);
    } catch (err) {
      console.log("[resolve] lens crop error:", err?.message || err);
    }
  }

  if (!upgraded.size) return { amazon, others, lensUsed };

  const nextAmazon = [];
  const nextOthers = [];
  const consume = (list, bucket) => {
    for (const p of list) {
      const hit = upgraded.get(p.title);
      if (hit) {
        nextAmazon.push(hit);
        upgraded.delete(p.title);
      } else {
        bucket.push(p);
      }
    }
  };
  consume(amazon, nextAmazon);
  consume(others, nextOthers);
  // Anything still in upgraded was only in others and got promoted.
  for (const hit of upgraded.values()) nextAmazon.push(hit);

  return { amazon: nextAmazon, others: nextOthers, lensUsed };
}


// ---------------------------------------------------------------------------
// /resolve
// ---------------------------------------------------------------------------

async function handleResolve(request, env, ctx) {
  try {
    const hasLens = Boolean(env.BRIGHTDATA_API_KEY && env.BRIGHTDATA_ZONE);
    const hasVision = Boolean(env.AI) || Boolean(String(env.GEMINI_API_KEY || "").trim());
    if (!hasLens && !hasVision) {
      return json(
        {
          ok: false,
          error:
            "Worker is not configured. Set GEMINI_API_KEY (or enable Workers AI), and optionally BRIGHTDATA_API_KEY + BRIGHTDATA_ZONE for Lens verification."
        },
        503,
        request,
        env
      );
    }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400, request, env);
  }

  const installId = String(body.installId || "").slice(0, 64);
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(installId)) {
    return json({ ok: false, error: "Missing or malformed installId." }, 400, request, env);
  }

  let bytes;
  try {
    bytes = decodeDataUrl(body.image);
  } catch (err) {
    return json({ ok: false, error: err.message }, 400, request, env);
  }

  const hash = await sha256Hex(bytes);

  // Cache first — only use cache if products were found
  if (env.CACHE) {
    const cached = await env.CACHE.get(`resolve:v3:${hash}`, "json");
    if (cached && Array.isArray(cached.products) && cached.products.length > 0) {
      return json({ ok: true, cached: true, ...reattachSourceCrops(bytes, cached) }, 200, request, env);
    }
  }

  const limit = await checkRateLimit(installId, env);
  if (!limit.allowed) {
    return json({ ok: false, error: limit.error }, 429, request, env);
  }

  let amazon = [];
  let others = [];
  let engine = "lens";
  let rawVisionText = null;
  let visionModel = null;
  let lensCrops = 0;

  // Prefer vision (Gemini) first when available — it names + locates products in
  // a busy live-stream frame. Lens on the full frame alone is noisy (UI chrome,
  // face, logos). When Bright Data is also set we Lens the per-product crops.
  if (hasVision) {
    try {
      const geminiKey = (request.headers.get("X-Gemini-Key") || "").trim() || undefined;
      const res = await resolveWithVision(bytes, env, { geminiKey });
      amazon = res.amazon;
      others = res.others;
      rawVisionText = res.rawText;
      visionModel = res.model;
      engine = String(visionModel || "").startsWith("gemini") ? "gemini" : "workers-ai";

      if (hasLens && (amazon.length || others.length)) {
        const enriched = await enrichWithLensCrops(bytes, amazon, others, env, ctx);
        amazon = enriched.amazon;
        others = enriched.others;
        lensCrops = enriched.lensUsed;
        if (lensCrops > 0) engine = `${engine}+lens`;
      }
    } catch (err) {
      console.log("[resolve] vision error on frame:", err.message);
      // Fall through to full-frame Lens if we have it; otherwise empty.
      if (!hasLens) {
        amazon = [];
        others = [];
        engine = "none";
        rawVisionText = err.message;
      } else {
        engine = "lens";
      }
    }
  }

  if ((!amazon.length && !others.length && hasLens && engine !== "none") || (!hasVision && hasLens)) {
    if (!env.IMAGES) {
      return json({ ok: false, error: "Image storage is not configured." }, 500, request, env);
    }

    await env.IMAGES.put(hash, bytes, {
      httpMetadata: { contentType: "image/jpeg" }
    });
    const publicUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/img/${hash}`;

    let payload;
    try {
      payload = await callLens(publicUrl, env);
    } catch (err) {
      ctx.waitUntil(env.IMAGES.delete(hash));
      // If vision already produced results we keep them; only fail hard when
      // Lens was the sole engine.
      if (!amazon.length && !others.length) {
        const message = err.name === "AbortError" ? "Lens request timed out." : err.message;
        return json({ ok: false, error: message }, 502, request, env);
      }
      payload = null;
    }

    ctx.waitUntil(env.IMAGES.delete(hash));
    if (payload) {
      const lens = parseLensResponse(payload);
      amazon = lens.amazon.map(normalizeLensProduct);
      others = lens.others.map(normalizeLensProduct);
      engine = "lens";
    }
  }

  const allProducts = [...amazon, ...others];
  const result = {
    products: allProducts,
    amazon,
    others,
    count: allProducts.length,
    engine,
    visionModel,
    lensCrops,
    rawVisionText
  };

  if (env.CACHE && allProducts.length > 0) {
    // Persist without bulky sourceCrop data URLs; reattach from box_2d on hit.
    ctx.waitUntil(
      env.CACHE.put(`resolve:v3:${hash}`, JSON.stringify(stripSourceCrops(result)), {
        expirationTtl: LIMITS.CACHE_TTL_SECONDS
      })
    );
  }

  // Auto-sync products into user's cloud wishlist if authenticated
  const user = await getCurrentUser(env, request).catch(() => null);
  if (user && allProducts.length > 0 && env.DB) {
    ctx.waitUntil((async () => {
      for (const p of allProducts.slice(0, 5)) {
        const id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await env.DB.prepare(`
          INSERT INTO saved_products (id, user_id, asin, title, price, image_url, product_url, category, source, verified, sighting_count, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
          ON CONFLICT(user_id, COALESCE(asin, title)) DO UPDATE SET
            sighting_count = sighting_count + 1,
            last_seen_at = datetime('now'),
            price = excluded.price,
            image_url = COALESCE(excluded.image_url, saved_products.image_url)
        `).bind(
          id,
          user.id,
          p.asin || null,
          p.title || "Detected Product",
          typeof p.priceValue === "number" ? p.priceValue : typeof p.price === "number" ? p.price : null,
          p.imageUrl || p.image || p.thumbnail || null,
          p.url || null,
          p.category || "General",
          "amazon",
          p.verified ? 1 : 0
        ).run().catch(() => {});
      }
    })());
  }

  // Until the upstream schema is confirmed against live traffic, log the shape
  // (not the content) of any response we failed to parse.
  if (amazon.length === 0 && others.length === 0) {
    console.log("[resolve] no products via", engine);
  }

  return json({ ok: true, cached: false, ...result }, 200, request, env);
  } catch (err) {
    console.error("[resolve fatal error]", err);
    return json({ ok: false, error: err.message || "Internal server error" }, 500, request, env);
  }
}

// ---------------------------------------------------------------------------
// /resolve-url
// ---------------------------------------------------------------------------

async function handleResolveUrl(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400, request, env);
  }

  const targetUrl = body.url;
  if (!targetUrl || !/^https?:\/\//.test(targetUrl)) {
    return json({ ok: false, error: "Valid URL is required." }, 400, request, env);
  }

  try {
    // 1. Fetch the target URL to extract og:image
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      redirect: "follow"
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch target URL: ${response.status}`);
    }

    const html = await response.text();
    
    // Quick regex to find og:image or twitter:image
    let imageUrl = null;
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) || 
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
    if (ogMatch && ogMatch[1]) {
      imageUrl = ogMatch[1];
    } else {
      const twMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (twMatch && twMatch[1]) imageUrl = twMatch[1];
    }

    // Special case for TikTok if regex fails: they sometimes use dynamic hydration
    if (!imageUrl && targetUrl.includes("tiktok.com")) {
      const coverMatch = html.match(/"cover(?:Url)?":\s*\[?"([^"\\]+)"/i);
      if (coverMatch && coverMatch[1]) {
        imageUrl = coverMatch[1].replace(/\\u002F/g, '/');
      }
    }

    if (!imageUrl) {
      return json({ ok: false, error: "Could not find a thumbnail or image in the provided URL." }, 400, request, env);
    }
    
    // Fix relative URLs
    if (imageUrl.startsWith("/")) {
      const parsedTarget = new URL(targetUrl);
      imageUrl = `${parsedTarget.protocol}//${parsedTarget.host}${imageUrl}`;
    }

    // Decode HTML entities
    imageUrl = imageUrl.replace(/&amp;/g, '&');

    // 2. Fetch the image itself
    const imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": "StreamSnap Bot" }
    });
    
    if (!imgRes.ok) {
      throw new Error(`Failed to download thumbnail image from ${imageUrl}`);
    }
    
    const arrayBuffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    if (bytes.length > LIMITS.MAX_IMAGE_BYTES) {
      return json({ ok: false, error: "Extracted image is too large." }, 400, request, env);
    }

    // Encode to base64
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    // 3. Mutate the request body to simulate a normal /resolve call and pass it along
    const simulatedRequest = new Request(request.url.replace("/resolve-url", "/resolve"), {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        installId: body.installId,
        image: `data:image/jpeg;base64,${base64}`
      })
    });
    
    return handleResolve(simulatedRequest, env, ctx);

  } catch (err) {
    return json({ ok: false, error: err.message }, 500, request, env);
  }
}
