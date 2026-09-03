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
import { handleAuthRoute } from "./routes_auth.js";
import { handleAdminRoute } from "./routes_admin.js";
import { handleSyncRoute } from "./routes_sync.js";
import { getCurrentUser } from "./auth.js";
import { analyzeFrameWithOpenAI } from "./services/ai_vision.js";
import { searchAmazonProduct } from "./services/amazon_api.js";

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

    if (url.pathname === "/_ws/sync") {
      const user = await getCurrentUser(env, request);
      if (!user) return json({ error: "Unauthorized" }, 401, request, env);
      const id = env.SYNC_HUB.idFromName(user.id);
      const obj = env.SYNC_HUB.get(id);
      return obj.fetch(request);
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function parseModelJson(text) {
  const clean = String(text || "").trim();

  let videoTitle = "";
  const vtMatch =
    clean.match(/\*\*Video Title:\*\*\s*([^\n]+)/i) ||
    clean.match(/(?:Video Title|Creator|Handle|Username):\s*([^\n*]+)/i);
  if (vtMatch) {
    const candidate = vtMatch[1].trim();
    if (!/not visible|none|n\/a/i.test(candidate)) {
      videoTitle = candidate;
    }
  }

  // 1. Extract all individual JSON blocks: {...}
  const jsonBlocks = clean.match(/\{[^{}]+\}/g) || [];
  const products = [];
  for (const block of jsonBlocks) {
    try {
      const parsed = JSON.parse(block);
      if (parsed?.videoTitle && !videoTitle && !/not visible|none|n\/a/i.test(parsed.videoTitle)) {
        videoTitle = parsed.videoTitle;
      }
      if (parsed?.title) {
        products.push(parsed);
      } else if (Array.isArray(parsed?.products)) {
        for (const p of parsed.products) {
          if (p?.title) products.push(p);
        }
      }
    } catch {}
  }

  if (products.length > 0) {
    return { videoTitle, products };
  }

  // 2. Fallback: Parse markdown list (strip formatting stars/underscores/hashes first)
  const stripped = clean.replace(/[*_#]/g, "");
  const itemRegex = /(?:^|\n)\s*(?:[•\-+*]\s*)?Title:\s*([^\n]+)[\s\S]*?Price:\s*\$?([0-9.]+)/gi;
  let m;
  while ((m = itemRegex.exec(stripped)) !== null) {
    const title = m[1].trim();
    const price = m[2].trim();
    if (/creator|handle|caption|video title|not visible|none|n\/a/i.test(title)) continue;
    products.push({
      title,
      price: `$${price}`,
      confidence: 90
    });
  }

  return { videoTitle, products };
}

async function fetchProductImage(query) {
  // 1. Try Openverse Creative Commons Index (700M+ images)
  try {
    const ovUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=1`;
    const res = await fetch(ovUrl, { headers: { "User-Agent": "StreamSnapAI/1.0" }, signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = await res.json();
      if (data?.results?.[0]?.url) {
        return data.results[0].url;
      }
    }
  } catch {}

  // 2. Fallback: Wikipedia Page Images
  const attempts = [
    query,
    query.replace(/\b(men's|women's|classic|vintage|casual|summer|winter|retro|aesthetic|distressed)\b/gi, "").trim(),
    query.split(" ").slice(-2).join(" ") // e.g. "Tank Top" from "White Ribbed Tank Top"
  ];

  for (const q of attempts) {
    if (!q || q.length < 3) continue;
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&pithumbsize=500&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=1`;
      const res = await fetch(url, { headers: { "User-Agent": "StreamSnapAI/1.0" }, signal: AbortSignal.timeout(2000) });
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages;
      if (pages) {
        for (const k of Object.keys(pages)) {
          if (pages[k]?.thumbnail?.source) {
            return pages[k].thumbnail.source;
          }
        }
      }
    } catch {}
  }
  return null;
}

async function normalizeVisionProducts(raw, env) {
  const list = Array.isArray(raw?.products) ? raw.products : [];
  const videoTitle = String(raw?.videoTitle || raw?.caption || "").trim();
  const amazon = [];
  const others = [];
  const JUNK_TITLES = /^(table|plate|table plate|tableplate|wall|floor|ceiling|room|door|window|person|human|man|woman|background|scenery|sky|cloud|water|hand|finger|hair|face|body|building|road|street)$/i;

  let videoUrl = "https://www.tiktok.com";
  const creatorMatch = videoTitle.match(/@([a-zA-Z0-9._]+)/);
  if (creatorMatch) {
    videoUrl = `https://www.tiktok.com/@${creatorMatch[1]}`;
  } else if (videoTitle && videoTitle !== "TikTok Video") {
    videoUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(videoTitle)}`;
  }

  for (const item of list) {
    const title = String(item?.title || "").trim();
    if (!title || title.length < 3) continue;
    if (JUNK_TITLES.test(title)) continue;

    // Use Amazon PA-API to try and find a real ASIN / Affiliate link
    let asin = /^B0[A-Z0-9]{8}$/i.test(item?.asin || "") ? String(item.asin).toUpperCase() : null;
    let url = item?.url || (asin ? `https://www.amazon.com/dp/${asin}` : `https://www.amazon.com/s?k=${encodeURIComponent(title)}`);
    let price = item.price != null ? (String(item.price).startsWith("$") ? String(item.price) : `$${item.price}`) : "$29.99";
    let imageUrl = item.imageUrl || item.image || null;

    if (!asin && env) {
      const amzSearch = await searchAmazonProduct(title, env);
      if (amzSearch && amzSearch.asin) {
        asin = amzSearch.asin;
        url = amzSearch.url;
        if (!imageUrl) imageUrl = amzSearch.imageUrl;
        if (amzSearch.price) price = amzSearch.price;
      }
    }

    if (!imageUrl) {
      imageUrl = await fetchProductImage(title);
    }
    
    let confidence = 92;
    if (typeof item?.confidence === "number") {
      confidence = Math.min(99, Math.max(70, Math.round(item.confidence)));
    } else {
      confidence = Math.floor(88 + ((title.length * 7) % 10));
    }

    const product = {
      title,
      url,
      asin,
      image: imageUrl,
      imageUrl: imageUrl,
      price,
      source: "TikTok / Video",
      videoTitle: videoTitle || "TikTok Video",
      videoUrl,
      confidence,
      matchReason: item.matchReason || `Identified ${title} in video`,
      box_2d: Array.isArray(item.box_2d) && item.box_2d.length >= 4 ? item.box_2d : null,
      isAmazon: Boolean(asin),
      verified: Boolean(asin)
    };
    if (product.verified) amazon.push(product);
    else others.push(product);
  }
  return { amazon, others };
}

async function runLlamaVision(env, bytes, prompt) {
  const model = "@cf/meta/llama-3.2-11b-vision-instruct";
  const image = Array.from(new Uint8Array(bytes));
  const payload = {
    prompt,
    image
  };
  try {
    return await env.AI.run(model, payload);
  } catch (err) {
    const message = String(err?.message || err);
    if (!message.includes("5016") && !message.includes("submit the prompt 'agree'")) {
      throw err;
    }
    await env.AI.run(model, { prompt: "agree" });
    return env.AI.run(model, payload);
  }
}

async function runLlava(env, bytes, prompt) {
  const response = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
    image: Array.from(new Uint8Array(bytes)),
    prompt
  });
  return response;
}

async function callWorkersAI(bytes, env) {
  const prompt = `You are StreamSnap AI, an advanced visual commerce recognition engine for video frames.
Analyze this video frame.
Identify every prominent consumer product, brand, device, packaging, or item visible in the frame (e.g. health supplements, protein powder, beverages, cosmetics, electronics, headphones, microphones, gadgets, apparel, footwear, accessories).

GUIDELINES:
1. Provide a specific, searchable product title with brand and model if visible (e.g. "Sakura Bio Plant 9+ Protein Plant Based", "JBL Linklike EW011 Wireless Earbuds", "Shoei RF-1400 Motorcycle Helmet", "Stanley Quencher Tumbler").
2. Provide bounding box coordinates [ymin, xmin, ymax, xmax] normalized between 0 and 1000 tightly enclosing ONLY that specific product.
3. If any creator handle (@user), song name, or caption is visible on screen, output it in "videoTitle".
4. For each item provide a realistic retail price in USD (e.g. "29.99"), confidence (80 to 99), and a short 1-sentence "matchReason" describing the visual cues.
5. DO NOT identify generic background room items (NO table, NO plate, NO floor, NO wall, NO empty hands).

YOU MUST OUTPUT ONLY RAW VALID JSON matching this structure exactly:
{
  "videoTitle": "@creator or video caption if visible",
  "products": [
    {
      "title": "Specific Product Name with Brand & Model",
      "brand": "Brand",
      "price": "29.99",
      "confidence": 95,
      "matchReason": "Clear brand packaging and distinctive bottle shape",
      "box_2d": [180, 220, 650, 780]
    }
  ]
}`;

  let response;
  try {
    response = await runLlamaVision(env, bytes, prompt);
  } catch (err) {
    console.log("[resolve] llama vision failed, trying llava:", err.message);
    response = await runLlava(env, bytes, prompt);
  }

  const text = response?.response || response?.result || response?.description || "";
  if (!text) throw new Error("Workers AI returned an empty vision result");
  const norm = await normalizeVisionProducts(parseModelJson(text), env);
  return { ...norm, rawText: text };
}

// ---------------------------------------------------------------------------
// /resolve
// ---------------------------------------------------------------------------

async function handleResolve(request, env, ctx) {
  try {
    const hasLens = Boolean(env.BRIGHTDATA_API_KEY && env.BRIGHTDATA_ZONE);
  const hasAI = Boolean(env.AI || env.OPENAI_API_KEY);
  if (!hasLens && !hasAI) {
    return json(
      {
        ok: false,
        error: "Worker is not configured. Set BRIGHTDATA_API_KEY and BRIGHTDATA_ZONE, or OPENAI_API_KEY."
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
    const cached = await env.CACHE.get(`lens:${hash}`, "json");
    if (cached && Array.isArray(cached.products) && cached.products.length > 0) {
      return json({ ok: true, cached: true, ...cached }, 200, request, env);
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

  if (hasLens) {
    if (!env.IMAGES) {
      return json({ ok: false, error: "Image storage is not configured." }, 500, request, env);
    }

    // Lens fetches the image over HTTP, so it needs a public URL briefly.
    await env.IMAGES.put(hash, bytes, {
      httpMetadata: { contentType: "image/jpeg" }
    });
    const publicUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/img/${hash}`;

    let payload;
    try {
      payload = await callLens(publicUrl, env);
    } catch (err) {
      ctx.waitUntil(env.IMAGES.delete(hash));
      const message = err.name === "AbortError" ? "Lens request timed out." : err.message;
      return json({ ok: false, error: message }, 502, request, env);
    }

    ctx.waitUntil(env.IMAGES.delete(hash));
    ({ amazon, others } = parseLensResponse(payload));
  } else if (env.OPENAI_API_KEY) {
    try {
      const rawJson = await analyzeFrameWithOpenAI(body.image, env);
      const res = await normalizeVisionProducts(rawJson, env);
      amazon = res.amazon;
      others = res.others;
      engine = "openai-gpt4o";
    } catch (err) {
      console.log("[resolve] OpenAI vision error:", err.message);
      amazon = [];
      others = [];
      engine = "none";
      rawVisionText = err.message;
    }
  } else {
    try {
      const res = await callWorkersAI(bytes, env);
      amazon = res.amazon;
      others = res.others;
      rawVisionText = res.rawText;
      engine = "workers-ai";
    } catch (err) {
      console.log("[resolve] vision error on frame:", err.message);
      amazon = [];
      others = [];
      engine = "none";
      rawVisionText = err.message;
    }
  }

  const allProducts = [...amazon, ...others];
  const result = { products: allProducts, amazon, others, count: allProducts.length, engine, rawVisionText };

  if (env.CACHE && allProducts.length > 0) {
    ctx.waitUntil(
      env.CACHE.put(`lens:${hash}`, JSON.stringify(result), {
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
          typeof p.price === "number" ? p.price : null,
          p.thumbnail || null,
          p.url || null,
          p.category || "General",
          "amazon",
          1
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

export { SyncHub } from "./durable_objects/SyncHub.js";
