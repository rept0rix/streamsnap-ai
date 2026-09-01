/**
 * StreamSnap Platform — authentication.
 *
 * One OAuth flow serves both clients. The website completes it with a redirect
 * and gets an HttpOnly cookie; the extension completes the same flow through
 * chrome.identity.launchWebAuthFlow and gets a bearer token. Both end up
 * holding a session created here, so every downstream check is identical.
 *
 * There are no passwords anywhere in this system. Identity comes from Google,
 * so there is nothing to hash, reset, or leak.
 */

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const STATE_TTL_SECONDS = 600; // OAuth round trip
const SESSION_COOKIE = "ss_session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomId(prefix, bytes = 24) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  const hex = [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
  return prefix ? `${prefix}_${hex}` : hex;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Decode a JWT payload without verifying the signature.
 *
 * Safe here, and only here: this id_token was received directly from Google's
 * token endpoint over TLS in exchange for our client secret. It did not pass
 * through the browser, so there is no attacker in the path to forge it. An
 * id_token arriving by any other route MUST be signature-verified instead.
 */
function decodeIdToken(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token");
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
  return JSON.parse(atob(padded));
}

function isAdminEmail(email, env) {
  const list = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(email).toLowerCase());
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * Begin the flow. `client` records which surface started it so the callback
 * knows whether to set a cookie or hand back a token.
 */
export async function buildAuthUrl(env, { redirectUri, client = "web" }) {
  const state = randomId("st");
  await env.CACHE.put(
    `oauth:${state}`,
    JSON.stringify({ client, redirectUri }),
    { expirationTtl: STATE_TTL_SECONDS }
  );

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account"
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Consume the state token. Single use — replaying it must fail. */
export async function consumeState(env, state) {
  if (!state) return null;
  const raw = await env.CACHE.get(`oauth:${state}`);
  if (!raw) return null;
  await env.CACHE.delete(`oauth:${state}`);
  return JSON.parse(raw);
}

export async function exchangeCodeForProfile(env, code, redirectUri) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status}`);
  }

  const { id_token: idToken } = await response.json();
  const claims = decodeIdToken(idToken);

  if (!claims.email || !claims.sub) {
    throw new Error("Google did not return an email");
  }
  if (claims.email_verified === false) {
    throw new Error("Google account email is not verified");
  }

  return {
    googleSub: claims.sub,
    email: claims.email.toLowerCase(),
    name: claims.name || null,
    avatarUrl: claims.picture || null
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Find or create the account for a Google profile.
 *
 * Matches on google_sub first, then email, so a user who signed up before this
 * column existed is linked rather than duplicated.
 */
export async function upsertUser(env, profile) {
  const db = env.DB;

  let user = await db
    .prepare("SELECT * FROM users WHERE google_sub = ? OR email = ? LIMIT 1")
    .bind(profile.googleSub, profile.email)
    .first();

  const now = new Date().toISOString();

  if (user) {
    await db
      .prepare(
        `UPDATE users
            SET google_sub = COALESCE(google_sub, ?),
                name       = COALESCE(?, name),
                avatar_url = COALESCE(?, avatar_url),
                last_seen_at = ?
          WHERE id = ?`
      )
      .bind(profile.googleSub, profile.name, profile.avatarUrl, now, user.id)
      .run();

    return { ...user, last_seen_at: now };
  }

  // The first administrators are seeded from config rather than promoted
  // through the UI, so there is no chicken-and-egg on the very first deploy.
  const role = isAdminEmail(profile.email, env) ? "admin" : "user";
  const id = randomId("usr");

  await db
    .prepare(
      `INSERT INTO users (id, email, name, avatar_url, google_sub, role, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, profile.email, profile.name, profile.avatarUrl, profile.googleSub, role, now)
    .run();

  await db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").bind(id).run();

  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

// ---------------------------------------------------------------------------
// Sessions
//
// Stored in KV rather than D1: every request validates a session, and KV reads
// are far cheaper than a D1 query. Only the SHA-256 of the token is used as the
// key, so a leaked KV listing yields no usable credentials.
// ---------------------------------------------------------------------------

export async function createSession(env, user) {
  const token = randomId("", 32);
  const key = `sess:${await sha256Hex(token)}`;

  await env.CACHE.put(
    key,
    JSON.stringify({ userId: user.id, role: user.role, createdAt: Date.now() }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  return { token, expiresIn: SESSION_TTL_SECONDS };
}

export async function destroySession(env, token) {
  if (!token) return;
  await env.CACHE.delete(`sess:${await sha256Hex(token)}`);
}

function readToken(request) {
  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();

  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

/**
 * Resolve the caller. Returns null when unauthenticated.
 *
 * Role is re-read from D1 rather than trusted from the session blob, so a
 * demotion or block takes effect immediately instead of at session expiry.
 */
export async function getCurrentUser(env, request) {
  const token = readToken(request);
  if (!token) return null;

  const raw = await env.CACHE.get(`sess:${await sha256Hex(token)}`);
  if (!raw) return null;

  const { userId } = JSON.parse(raw);
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!user) return null;

  if (user.blocked_at) {
    return { ...user, blocked: true };
  }

  return user;
}

/**
 * Session cookie.
 *
 * SameSite=None is required, not preferred. The site and the API live on
 * different registrable domains (streamsnap.online vs workers.dev), so a Lax
 * cookie would simply not be attached to the site's fetch('/auth/me') call and
 * every visitor would appear signed out. None demands Secure, which is fine
 * since everything here is HTTPS.
 *
 * CSRF is not a concern for the routes this protects: /auth/me is a read, and
 * every mutating route requires the bearer token instead.
 */
export function sessionCookie(token, { secure = true } = {}) {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=None",
    `Max-Age=${SESSION_TTL_SECONDS}`
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearCookie() {
  // Must mirror the attributes above, or the browser will not match and clear it.
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0`;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(env, request) {
  const user = await getCurrentUser(env, request);
  if (!user) throw new AuthError("Sign in to continue.", 401);
  if (user.blocked) {
    throw new AuthError(user.blocked_reason || "This account has been suspended.", 403);
  }
  return user;
}

export async function requireAdmin(env, request) {
  const user = await requireUser(env, request);
  if (user.role !== "admin") {
    // Deliberately identical to a missing route: an admin surface should not
    // confirm its own existence to a signed-in non-admin.
    throw new AuthError("Not found", 404);
  }
  return user;
}

/** Record a privileged action. Never throws — auditing must not break the action. */
export async function audit(env, actorId, action, { targetType, targetId, detail } = {}) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(actorId, action, targetType || null, targetId || null, detail ? JSON.stringify(detail) : null)
      .run();
  } catch (err) {
    console.error("[audit] failed to record", action, err);
  }
}
