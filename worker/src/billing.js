/**
 * StreamSnap Platform — scan packs and payments.
 *
 * The free trial is metered in quota.js. When it runs out a signed-in user
 * either buys a scan pack here or adds their own Gemini key (never metered).
 *
 * Payments go through Stripe Checkout so no card data ever touches this
 * Worker. Credits are granted from two places, both idempotent on the Checkout
 * Session id (purchases.provider_ref is UNIQUE):
 *
 *   POST /billing/webhook  — Stripe calls us (checkout.session.completed).
 *   POST /billing/confirm  — the account page calls us with the session id it
 *                            was redirected back with. This covers the window
 *                            before the webhook lands, and deployments where no
 *                            webhook has been configured yet.
 *
 * Without STRIPE_SECRET_KEY set, checkout answers 503 with
 * code PURCHASES_DISABLED and an admin can still grant packs by hand via
 * POST /api/admin/users/:id/credits.
 *
 * Secrets (wrangler secret put): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 */

import { requireUser, audit } from "./auth.js";
import { addCredits, quotaSummary, freeTrialSize } from "./quota.js";

export const PACKAGES = [
  {
    id: "pack_200",
    name: "Starter Pack",
    credits: 200,
    amountCents: 499,
    currency: "usd",
    blurb: "A month of casual stream shopping."
  },
  {
    id: "pack_1000",
    name: "Shopper Pack",
    credits: 1000,
    amountCents: 1499,
    currency: "usd",
    popular: true,
    blurb: "Best value for regular viewers."
  },
  {
    id: "pack_5000",
    name: "Power Pack",
    credits: 5000,
    amountCents: 4999,
    currency: "usd",
    blurb: "For creators and heavy users."
  }
];

export function findPackage(id) {
  return PACKAGES.find((p) => p.id === id) || null;
}

export function purchasesEnabled(env) {
  return Boolean(String(env?.STRIPE_SECRET_KEY || "").trim());
}

function siteUrl(env) {
  const explicit = String(env?.PUBLIC_SITE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const first = String(env?.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return (first || "https://streamsnap.online").replace(/\/$/, "");
}

/** Where the account page sends people to buy more scans. Shared with 402 responses. */
export function upgradeUrl(env) {
  return `${siteUrl(env)}/account.html#shopper-plans`;
}

function randomId(prefix) {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------------------
// Stripe REST helpers (no SDK — Workers-friendly and tiny)
// ---------------------------------------------------------------------------

/** Flatten { a: { b: [x] } } into Stripe's form encoding a[b][0]=x. */
export function toStripeForm(obj, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === "object") toStripeForm(item, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(item));
      });
    } else if (typeof value === "object") {
      toStripeForm(value, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

async function stripe(env, method, path, params) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: method === "GET" ? undefined : toStripeForm(params || {}).toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Stripe ${response.status}`);
  }
  return data;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>...]
 * signed_payload = `${t}.${rawBody}`; HMAC-SHA256 with the endpoint secret.
 */
export async function verifyStripeSignature(rawBody, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!header || !secret) return false;
  const parts = String(header).split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;

  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

/**
 * Record a purchase and add its credits. Returns { granted, duplicate, credits }.
 * A repeated providerRef is a no-op — the second webhook delivery, the confirm
 * call racing the webhook, a retried admin click — all land here safely.
 */
export async function grantPurchase(env, { userId, packageId, credits, amountCents, currency, provider, providerRef, grantedBy, note }) {
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO purchases
       (id, user_id, package_id, credits, amount_cents, currency, provider, provider_ref, granted_by, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      randomId("pur"),
      userId,
      packageId,
      credits,
      amountCents,
      currency || "usd",
      provider,
      providerRef || null,
      grantedBy || null,
      note || null
    )
    .run();

  if (res?.meta?.changes === 0) {
    const row = await env.DB.prepare("SELECT scan_credits FROM users WHERE id = ?").bind(userId).first();
    return { granted: false, duplicate: true, credits: Number(row?.scan_credits) || 0 };
  }

  const total = await addCredits(env, userId, credits);
  return { granted: true, duplicate: false, credits: total };
}

async function grantFromSession(env, session) {
  if (!session || session.payment_status !== "paid") return { granted: false, reason: "unpaid" };
  const meta = session.metadata || {};
  const userId = meta.userId || session.client_reference_id;
  const pkg = findPackage(meta.packageId);
  if (!userId || !pkg) return { granted: false, reason: "unrecognised session" };

  const result = await grantPurchase(env, {
    userId,
    packageId: pkg.id,
    credits: pkg.credits,
    amountCents: Number(session.amount_total) || pkg.amountCents,
    currency: session.currency || pkg.currency,
    provider: "stripe",
    providerRef: session.id
  });
  if (result.granted) {
    await audit(env, userId, "billing.purchase", {
      targetType: "user",
      targetId: userId,
      detail: { packageId: pkg.id, credits: pkg.credits, sessionId: session.id }
    }).catch(() => {});
  }
  return { ...result, packageId: pkg.id, userId };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function handleBillingRoute(request, env, url, json) {
  const path = url.pathname;
  if (!path.startsWith("/billing/")) return null;

  // --- Catalogue (public) --------------------------------------------------
  if (path === "/billing/packages" && request.method === "GET") {
    return json(
      {
        ok: true,
        purchasesEnabled: purchasesEnabled(env),
        freeTrialScans: freeTrialSize(env),
        byoKeySupported: true,
        upgradeUrl: upgradeUrl(env),
        packages: PACKAGES.map((p) => ({
          id: p.id,
          name: p.name,
          credits: p.credits,
          amountCents: p.amountCents,
          currency: p.currency,
          popular: Boolean(p.popular),
          blurb: p.blurb
        }))
      },
      200,
      request,
      env
    );
  }

  // --- Stripe webhook (no session; signature is the auth) -------------------
  if (path === "/billing/webhook" && request.method === "POST") {
    const rawBody = await request.text();
    const ok = await verifyStripeSignature(rawBody, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
    if (!ok) return json({ ok: false, error: "Invalid signature." }, 400, request, env);

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json({ ok: false, error: "Invalid JSON." }, 400, request, env);
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const result = await grantFromSession(env, event.data?.object);
      return json({ ok: true, received: true, ...result }, 200, request, env);
    }
    return json({ ok: true, received: true, ignored: event.type }, 200, request, env);
  }

  // Everything below is for a signed-in user.
  let user;
  try {
    user = await requireUser(env, request);
  } catch (err) {
    return json({ ok: false, error: err.message }, err.status || 401, request, env);
  }

  // --- Start a purchase -----------------------------------------------------
  if (path === "/billing/checkout" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const pkg = findPackage(body.packageId);
    if (!pkg) return json({ ok: false, error: "Unknown package." }, 400, request, env);

    if (!purchasesEnabled(env)) {
      return json(
        {
          ok: false,
          code: "PURCHASES_DISABLED",
          error: "Purchases are not enabled yet. Add your own Gemini key in Setup for unlimited scans, or contact support.",
          contact: env.SUPPORT_EMAIL || null
        },
        503,
        request,
        env
      );
    }

    const base = `${siteUrl(env)}/account.html`;
    try {
      const session = await stripe(env, "POST", "/checkout/sessions", {
        mode: "payment",
        client_reference_id: user.id,
        customer_email: user.email,
        success_url: `${base}?purchase=success&session_id={CHECKOUT_SESSION_ID}#shopper-plans`,
        cancel_url: `${base}?purchase=cancelled#shopper-plans`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: pkg.currency,
              unit_amount: pkg.amountCents,
              product_data: {
                name: `StreamSnap ${pkg.name} — ${pkg.credits.toLocaleString("en-US")} scans`,
                description: pkg.blurb
              }
            }
          }
        ],
        metadata: { userId: user.id, packageId: pkg.id, credits: pkg.credits }
      });
      return json({ ok: true, url: session.url, sessionId: session.id }, 200, request, env);
    } catch (err) {
      console.error("[billing] checkout failed:", err.message);
      return json({ ok: false, error: `Could not start checkout: ${err.message}` }, 502, request, env);
    }
  }

  // --- Confirm after redirect (idempotent with the webhook) ---------------
  if (path === "/billing/confirm" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const sessionId = String(body.sessionId || "").trim();
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      return json({ ok: false, error: "Invalid session id." }, 400, request, env);
    }
    if (!purchasesEnabled(env)) {
      return json({ ok: false, code: "PURCHASES_DISABLED", error: "Purchases are not enabled." }, 503, request, env);
    }

    let session;
    try {
      session = await stripe(env, "GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
    } catch (err) {
      return json({ ok: false, error: err.message }, 502, request, env);
    }

    const owner = session?.metadata?.userId || session?.client_reference_id;
    if (owner !== user.id) return json({ ok: false, error: "This purchase belongs to another account." }, 403, request, env);

    const result = await grantFromSession(env, session);
    const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
    return json({ ok: true, ...result, quota: await quotaSummary(env, fresh || user, null) }, 200, request, env);
  }

  // --- History ----------------------------------------------------------------
  if (path === "/billing/history" && request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT id, package_id, credits, amount_cents, currency, provider, created_at
         FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
      .bind(user.id)
      .all();
    return json(
      { ok: true, purchases: rows?.results || [], quota: await quotaSummary(env, user, null) },
      200,
      request,
      env
    );
  }

  // The old free self-serve upgrade let anyone flip themselves to Pro. Gone.
  if (path === "/billing/upgrade") {
    return json(
      { ok: false, error: "Plans are no longer self-assigned. Buy a scan pack via POST /billing/checkout." },
      410,
      request,
      env
    );
  }

  return null;
}
