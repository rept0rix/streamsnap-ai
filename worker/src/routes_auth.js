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

  if (parsed.protocol !== "https:") return false;

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

    const target =
      stored.returnTo && isAllowedReturnUrl(stored.returnTo, env)
        ? stored.returnTo
        : `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/`;

    return redirect(target, { "Set-Cookie": sessionCookie(token) });
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

  // --- Delete the account --------------------------------------------------
  //
  // Hard delete, not a soft flag. Every row referencing the user cascades, the
  // session is destroyed, and nothing recoverable is retained. Anything less
  // would not honour what the privacy policy promises.
  if (path === "/account" && request.method === "DELETE") {
    let user;
    try {
      user = await requireUser(env, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, err.status || 401, request, env);
    }

    // Recorded before deletion, and deliberately without the email address.
    await audit(env, user.id, "account.delete", {
      targetType: "user",
      targetId: user.id,
      detail: { self: true }
    });

    // usage_events keeps user_id ON DELETE CASCADE, so history goes with it.
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();

    const header = request.headers.get("Authorization") || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    const cookie = (request.headers.get("Cookie") || "").match(/ss_session=([^;]+)/);
    await destroySession(env, bearer || cookie?.[1]);

    // Drop the quota counter too, so a deleted account leaves nothing behind.
    await env.CACHE.delete(`q:${user.id}:${new Date().toISOString().slice(0, 7)}`).catch(() => {});

    return json({ ok: true, deleted: true }, 200, request, env, { "Set-Cookie": clearCookie() });
  }

  return null; // not an auth route
}

export { isAllowedReturnUrl };
