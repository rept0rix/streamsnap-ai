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

const LIMITS = {
  MAX_IMAGE_BYTES: 3 * 1024 * 1024,
  PER_HOUR: 60,
  PER_DAY: 400,
  IMAGE_TTL_SECONDS: 300, // Google fetches within seconds; 5 min is generous
  CACHE_TTL_SECONDS: 60 * 60 * 24 * 7,
  UPSTREAM_TIMEOUT_MS: 20000
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return preflight(request, env);
    if (url.pathname === "/health") return json({ ok: true }, 200, request, env);

    if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/account")) {
      const response = await handleAuthRoute(request, env, url, json);
      if (response) return response;
    }

    if (url.pathname.startsWith("/img/")) {
      return serveImage(url.pathname.slice(5), env);
    }

    if (url.pathname === "/resolve" && request.method === "POST") {
      return handleResolve(request, env, ctx);
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

  const allow =
    allowed.length === 0 || allowed.includes("*")
      ? origin || "*"
      : allowed.includes(origin)
        ? origin
        : allowed[0];

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function preflight(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env)
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

// ---------------------------------------------------------------------------
// /resolve
// ---------------------------------------------------------------------------

async function handleResolve(request, env, ctx) {
  if (!env.BRIGHTDATA_API_KEY || !env.BRIGHTDATA_ZONE) {
    return json({ ok: false, error: "Worker is not configured." }, 500, request, env);
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

  // Cache first — a repeated crop costs nothing and returns instantly.
  if (env.CACHE) {
    const cached = await env.CACHE.get(`lens:${hash}`, "json");
    if (cached) {
      return json({ ok: true, cached: true, ...cached }, 200, request, env);
    }
  }

  const limit = await checkRateLimit(installId, env);
  if (!limit.allowed) {
    return json({ ok: false, error: limit.error }, 429, request, env);
  }

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

  // The crop has served its purpose; do not retain user imagery.
  ctx.waitUntil(env.IMAGES.delete(hash));

  const { amazon, others } = parseLensResponse(payload);
  const result = { products: amazon, others, count: amazon.length };

  if (env.CACHE) {
    ctx.waitUntil(
      env.CACHE.put(`lens:${hash}`, JSON.stringify(result), {
        expirationTtl: LIMITS.CACHE_TTL_SECONDS
      })
    );
  }

  // Until the upstream schema is confirmed against live traffic, log the shape
  // (not the content) of any response we failed to parse.
  if (amazon.length === 0 && others.length === 0) {
    console.log("[lens] unparsed response shape:", JSON.stringify(collectRawShape(payload)));
  }

  return json({ ok: true, cached: false, ...result }, 200, request, env);
}
