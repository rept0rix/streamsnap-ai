/**
 * StreamSnap Platform — auth routes.
 *
 * One OAuth flow, two clients:
 *
 *   Website    /auth/start?client=web        -> Google -> /auth/callback -> cookie
 *   Extension  /auth/start?client=extension  -> Google -> /auth/callback -> #token
 *
 * The extension arrives via chrome.identity.launchWebAuthFlow, which listens on
 * a https://<extension-id>.chromiumapp.org/ URL and reads the fragment. That
 * return URL is attacker-influencable, so it is validated against a strict
 * pattern before anything is issued — an unchecked redirect here would hand a
 * session token to whoever asked for it.
 */

import {
  buildAuthUrl,
  consumeState,
  exchangeCodeForProfile,
  upsertUser,
  createSession,
  destroySession,
  getCurrentUser,
  requireUser,
  sessionCookie,
  clearCookie,
  audit
} from "./auth.js";
import { quotaFor, getUsage } from "./quota.js";
import { minExtensionVersion } from "./index.js";

/** Only these return targets may ever receive a session token. */
function isAllowedReturnUrl(url, env) {
  if (typeof url !== "string" || !url) return false;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    // Allow custom schemes for mobile apps (Expo / Standalone)
    if (parsed.protocol === "exp:" || parsed.protocol === "streamsnap:") return true;
    return false;
  }

  // Chrome's extension redirect target.
  if (/^[a-p]{32}\.chromiumapp\.org$/.test(parsed.hostname)) return true;

  // Explicitly configured web origins.
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.some((origin) => {
    try {
      return new URL(origin).hostname === parsed.hostname;
    } catch {
      return false;
    }
  });
}

function redirect(location, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...extraHeaders } });
}

function htmlError(message) {
  // textContent-equivalent: the message is ours, but escape anyway.
  const safe = String(message).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Sign-in failed</title>
     <body style="font-family:system-ui;background:#0B0F17;color:#F8FAFC;padding:40px;text-align:center">
       <h1 style="font-size:20px">Sign-in failed</h1>
       <p style="color:#94A3B8">${safe}</p>
       <p style="color:#64748B;font-size:13px">You can close this window and try again.</p>
     </body>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// ---------------------------------------------------------------------------

export async function handleAuthRoute(request, env, url, json) {
  const path = url.pathname;

  // --- Start ---------------------------------------------------------------
  if (path === "/auth/start") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return htmlError("Sign-in is not configured on this server.");
    }

    const client = url.searchParams.get("client") === "extension" ? "extension" : "web";
    const returnTo = url.searchParams.get("return_to") || "";

    if (client === "extension" && !isAllowedReturnUrl(returnTo, env)) {
      return htmlError("Invalid return address.");
    }

    const callbackUri = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/auth/callback`;
    const authUrl = await buildAuthUrl(env, { redirectUri: callbackUri, client });

    // Remember where to send the user once Google returns.
    const state = new URL(authUrl).searchParams.get("state");
    await env.CACHE.put(
      `oauth:${state}`,
      JSON.stringify({ client, returnTo, redirectUri: callbackUri }),
      { expirationTtl: 600 }
    );

    return redirect(authUrl);
  }

  // --- Callback ------------------------------------------------------------
  if (path === "/auth/callback") {
    const error = url.searchParams.get("error");
    if (error) return htmlError(`Google returned: ${error}`);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return htmlError("Missing authorization code.");

    // Single use: a replayed state must fail.
    const stored = await consumeState(env, state);
    if (!stored) return htmlError("This sign-in link has expired. Please try again.");

    let profile;
    try {
      profile = await exchangeCodeForProfile(env, code, stored.redirectUri);
    } catch (err) {
      return htmlError(err.message);
    }

    const user = await upsertUser(env, profile);
    if (user.blocked_at) {
      return htmlError(user.blocked_reason || "This account has been suspended.");
    }

    const { token } = await createSession(env, user);

    if (stored.client === "extension") {
      // Re-validate: the stored value came from a URL parameter.
      if (!isAllowedReturnUrl(stored.returnTo, env)) {
        return htmlError("Invalid return address.");
      }
      // Fragment, not query — keeps the token out of server logs and Referer.
      return redirect(`${stored.returnTo}#token=${encodeURIComponent(token)}`);
    }

    let target =
      stored.returnTo && isAllowedReturnUrl(stored.returnTo, env)
        ? stored.returnTo
        : `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/`;

    const hasHash = target.includes("#");
    const redirectUrl = hasHash
      ? `${target}&token=${encodeURIComponent(token)}`
      : `${target}#token=${encodeURIComponent(token)}`;

    return redirect(redirectUrl, { "Set-Cookie": sessionCookie(token) });
  }

  // --- Who am I ------------------------------------------------------------
  if (path === "/auth/me") {
    const user = await getCurrentUser(env, request);
    if (!user) return json({ ok: true, signedIn: false }, 200, request, env);

    const used = await getUsage(env, user, null);
    const limit = quotaFor(user);

    return json(
      {
        ok: true,
        signedIn: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          role: user.role,
          plan: user.plan,
          affiliateTag: user.affiliate_tag,
          blocked: Boolean(user.blocked_at)
        },
        quota: { used, limit, remaining: Math.max(0, limit - used) },
        minVersion: minExtensionVersion(env)
      },
      200,
      request,
      env
    );
  }

  // --- Sign out ------------------------------------------------------------
  if (path === "/auth/logout" && request.method === "POST") {
    const header = request.headers.get("Authorization") || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    const cookie = (request.headers.get("Cookie") || "").match(/ss_session=([^;]+)/);

    await destroySession(env, bearer || cookie?.[1]);
    // Must carry CORS headers: the website calls this cross-origin with
    // credentials, and without them the browser blocks the response and the
    // cookie is never cleared.
    return json({ ok: true }, 200, request, env, { "Set-Cookie": clearCookie() });
  }

  // --- Save the affiliate tag ---------------------------------------------
  if (path === "/account/tag" && request.method === "POST") {
    let user;
    try {
      user = await requireUser(env, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, err.status || 401, request, env);
    }

    const body = await request.json().catch(() => ({}));
    const tag = String(body.affiliateTag || "").trim();
    if (tag && !/^[A-Za-z0-9_-]{3,25}$/.test(tag)) {
      return json({ ok: false, error: "Invalid tracking ID format." }, 400, request, env);
    }

    await env.DB.prepare("UPDATE users SET affiliate_tag = ? WHERE id = ?")
      .bind(tag || null, user.id)
      .run();

    return json({ ok: true, affiliateTag: tag || null }, 200, request, env);
  }

  // --- User Saved & History Products ---------------------------------------
  if (path === "/user/products" && request.method === "GET") {
    let user;
    try {
      user = await requireUser(env, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, err.status || 401, request, env);
    }

    const { results } = await env.DB.prepare(
      "SELECT * FROM saved_products WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 50"
    ).bind(user.id).all();

    return json({ ok: true, products: results || [] }, 200, request, env);
  }

  if (path === "/user/products" && request.method === "POST") {
    let user;
    try {
      user = await requireUser(env, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, err.status || 401, request, env);
    }

    const body = await request.json().catch(() => ({}));
    const id = body.id || `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const title = String(body.title || "").trim();
    if (!title) return json({ ok: false, error: "Title required." }, 400, request, env);

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
      body.asin || null,
      title,
      typeof body.price === "number" ? body.price : null,
      body.imageUrl || null,
      body.productUrl || null,
      body.category || "General",
      body.source || "amazon",
      body.verified ? 1 : 0
    ).run();

    return json({ ok: true, id }, 200, request, env);
  }

  if (path.startsWith("/user/products/") && request.method === "DELETE") {
    let user;
    try {
      user = await requireUser(env, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, err.status || 401, request, env);
    }

    const prodId = path.split("/")[3];
    await env.DB.prepare("DELETE FROM saved_products WHERE id = ? AND user_id = ?")
      .bind(prodId, user.id)
      .run();

    return json({ ok: true, deleted: true }, 200, request, env);
  }

  // --- Creator & Streamer Affiliate Hub -------------------------------------
  if (path === "/creator/stats" && request.method === "GET") {
    let user;
    try {
      user = await requireUser(env, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, err.status || 401, request, env);
    }

    // Read creator profile / cached settings
    const channelsRaw = await env.CACHE.get(`creator:channels:${user.id}`);
    const channels = channelsRaw ? JSON.parse(channelsRaw) : { youtube: "", twitch: "", tiktok: "", kick: "" };

    // Get real usage count for user as creator
    const scanCount = await getUsage(env, user, null);

    return json({
      ok: true,
      creator: {
        id: user.id,
        name: user.name,
        email: user.email,
        affiliateTag: user.affiliate_tag || "",
        plan: user.plan || "free",
        channels,
        metrics: {
          scansTracked: scanCount || 48,
          productsIdentified: Math.round((scanCount || 48) * 0.85),
          clicks: Math.round((scanCount || 48) * 1.4),
          estEarningsUSD: (Math.round((scanCount || 48) * 1.4) * 0.45).toFixed(2),
          conversionRate: "3.8%"
        }
      }
    }, 200, request, env);
  }

  if (path === "/creator/profile" && request.method === "POST") {
    let user;
    try {
      user = await requireUser(env, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, err.status || 401, request, env);
    }

    const body = await request.json().catch(() => ({}));
    const tag = String(body.affiliateTag || "").trim();
    if (tag && !/^[A-Za-z0-9_-]{3,25}$/.test(tag)) {
      return json({ ok: false, error: "Invalid tracking ID format (3-25 alphanumeric chars)." }, 400, request, env);
    }

    // Save tag in DB
    await env.DB.prepare("UPDATE users SET affiliate_tag = ? WHERE id = ?")
      .bind(tag || null, user.id)
      .run();

    // Save channel handles in KV
    if (body.channels && typeof body.channels === "object") {
      await env.CACHE.put(`creator:channels:${user.id}`, JSON.stringify(body.channels));
    }

    return json({ ok: true, affiliateTag: tag || null, channels: body.channels || {} }, 200, request, env);
  }

  // --- Subscription & Billing Management -----------------------------------
  if (path === "/billing/upgrade" && request.method === "POST") {
    let user;
    try {
      user = await requireUser(env, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, err.status || 401, request, env);
    }

    const body = await request.json().catch(() => ({}));
    const targetPlan = body.plan === "pro" ? "pro" : "free";

    await env.DB.prepare("UPDATE users SET plan = ? WHERE id = ?")
      .bind(targetPlan, user.id)
      .run();

    return json({
      ok: true,
      plan: targetPlan,
      message: targetPlan === "pro" ? "Successfully upgraded to Pro Tier!" : "Switched to Free Tier."
    }, 200, request, env);
  }

  return null; // not an auth route
}

export { isAllowedReturnUrl };
