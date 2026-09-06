#!/usr/bin/env node
/**
 * Free trial → scan credits → bring-your-own-key, end to end through /resolve
 * and /billing/*.
 *
 * Guarantees locked in here:
 *   - an anonymous install gets a few scans, then must sign in;
 *   - a signed-in user gets FREE_TRIAL_SCANS lifetime, then spends credits,
 *     then gets a 402 that points at the packs page and mentions BYO key;
 *   - cache hits are never metered;
 *   - a caller's own Gemini key is never metered and never falls back onto our
 *     Workers AI budget; a rejected key is reported as such;
 *   - Stripe webhooks are signature-checked and idempotent;
 *   - the old free self-upgrade is gone.
 *
 * Usage: node worker/test/quota.test.mjs
 */

import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import worker from "../src/index.js";
import { verifyStripeSignature, toStripeForm, PACKAGES } from "../src/billing.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err.stack || err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const memoryKv = () => {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const v = store.get(key);
      if (v == null) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    }
  };
};

/** Just enough D1 for quota.js, billing.js and routes_admin.js. */
function fakeDb(usersById) {
  const purchases = [];
  const auditLog = [];
  const usage = [];
  const exec = (sql, args) => ({
    async first() {
      if (/SELECT \* FROM users WHERE id = \?/.test(sql)) {
        const u = usersById.get(args[0]);
        return u ? { ...u } : null;
      }
      if (/SELECT scan_credits FROM users WHERE id = \?/.test(sql)) {
        const u = usersById.get(args[0]);
        return u ? { scan_credits: u.scan_credits } : null;
      }
      if (/SELECT id, email, scan_credits FROM users WHERE id = \?/.test(sql)) {
        const u = usersById.get(args[0]);
        return u ? { id: u.id, email: u.email, scan_credits: u.scan_credits } : null;
      }
      return null;
    },
    async run() {
      if (/UPDATE users SET scan_credits = scan_credits - 1/.test(sql)) {
        const u = usersById.get(args[0]);
        if (u && u.scan_credits > 0) {
          u.scan_credits -= 1;
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      }
      if (/UPDATE users SET scan_credits = MAX/.test(sql)) {
        const u = usersById.get(args[1]);
        u.scan_credits = Math.max(0, (u.scan_credits || 0) + args[0]);
        return { meta: { changes: 1 } };
      }
      if (/INSERT OR IGNORE INTO purchases/.test(sql)) {
        const [id, user_id, package_id, credits, amount_cents, currency, provider, provider_ref] = args;
        if (provider_ref && purchases.some((p) => p.provider_ref === provider_ref)) return { meta: { changes: 0 } };
        purchases.push({ id, user_id, package_id, credits, amount_cents, currency, provider, provider_ref });
        return { meta: { changes: 1 } };
      }
      if (/INSERT INTO usage_events/.test(sql)) {
        usage.push(args);
        return { meta: { changes: 1 } };
      }
      if (/INSERT INTO audit_log/.test(sql)) {
        auditLog.push(args);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 1 } };
    },
    async all() {
      if (/FROM purchases WHERE user_id = \?/.test(sql)) {
        return { results: purchases.filter((p) => p.user_id === args[0]) };
      }
      return { results: [] };
    }
  });
  return {
    purchases,
    auditLog,
    usage,
    prepare(sql) {
      return { bind: (...args) => exec(sql, args), ...exec(sql, []) };
    }
  };
}

const MODEL_REPLY = {
  videoTitle: "@gadgetgirl",
  products: [{ title: "Apple Watch Series 8", brand: "Apple", price: 399, confidence: 91, box_2d: [100, 200, 600, 700] }]
};

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function makeWorld({ freeTrial = 3, anonTrial = 2, stripeKey, webhookSecret = "whsec_test" } = {}) {
  const users = new Map([
    ["usr_free", { id: "usr_free", email: "free@example.com", name: "Free", role: "user", plan: "free", scan_credits: 2, blocked_at: null }],
    ["usr_admin", { id: "usr_admin", email: "admin@example.com", name: "Admin", role: "admin", plan: "pro", scan_credits: 0, blocked_at: null }]
  ]);
  const CACHE = memoryKv();
  CACHE.store.set(`sess:${sha256("tok-free")}`, JSON.stringify({ userId: "usr_free" }));
  CACHE.store.set(`sess:${sha256("tok-admin")}`, JSON.stringify({ userId: "usr_admin" }));
  const DB = fakeDb(users);
  const ai = { calls: 0 };
  const env = {
    CACHE,
    DB,
    AI: {
      async run() {
        ai.calls += 1;
        return { response: JSON.stringify(MODEL_REPLY) };
      }
    },
    FREE_TRIAL_SCANS: String(freeTrial),
    ANON_TRIAL_SCANS: String(anonTrial),
    ALLOWED_ORIGINS: "https://streamsnap.online",
    STRIPE_SECRET_KEY: stripeKey,
    STRIPE_WEBHOOK_SECRET: webhookSecret
  };
  return { env, users, DB, ai };
}

const ctx = { waitUntil() {} };
let frameCounter = 0;
/** Each call yields a distinct image so the result cache does not short-circuit. */
function freshImage() {
  frameCounter += 1;
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, frameCounter & 0xff, (frameCounter >> 8) & 0xff]);
  return "data:image/jpeg;base64," + bytes.toString("base64");
}

async function call(env, path, { method = "POST", headers = {}, body, raw } = {}) {
  const request = new Request(`https://worker.test${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: method === "GET" ? undefined : raw ?? JSON.stringify(body ?? {})
  });
  const response = await worker.fetch(request, env, ctx);
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const resolveWith = (env, { token, geminiKey, image = freshImage(), installId = "install-anon-0001" } = {}) =>
  call(env, "/resolve", {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(geminiKey ? { "X-Gemini-Key": geminiKey } : {})
    },
    body: { image, installId }
  });

const stripeCalls = [];
let geminiMode = "ok";
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.startsWith("https://www.amazon.com/s?k=")) {
    return new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } });
  }
  if (href.startsWith("https://generativelanguage.googleapis.com/")) {
    if (geminiMode === "rejected") {
      return new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } }), { status: 400 });
    }
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(MODEL_REPLY) }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  if (href.startsWith("https://api.stripe.com/v1/checkout/sessions")) {
    stripeCalls.push({ href, init });
    if (init?.method === "GET") {
      return new Response(JSON.stringify({ id: "cs_test_123", payment_status: "paid", amount_total: 1499, currency: "usd", metadata: { userId: "usr_free", packageId: "pack_1000" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }), { status: 200 });
  }
  throw new Error(`unexpected fetch: ${href}`);
};

// ---------------------------------------------------------------------------

console.log("\nQuota: anonymous teaser");

await test("an anonymous install gets ANON_TRIAL_SCANS scans, then a 402 asking to sign in", async () => {
  const { env } = makeWorld({ anonTrial: 2 });
  const first = await resolveWith(env);
  assert.equal(first.status, 200);
  assert.equal(first.body.byoKey, false);
  assert.deepEqual([first.body.quota.used, first.body.quota.limit, first.body.quota.remaining], [1, 2, 1]);
  assert.equal(first.body.quota.period, "lifetime");

  const second = await resolveWith(env);
  assert.equal(second.status, 200);
  assert.equal(second.body.quota.remaining, 0);

  const third = await resolveWith(env);
  assert.equal(third.status, 402);
  assert.equal(third.body.ok, false);
  assert.equal(third.body.code, "TRIAL_EXHAUSTED_SIGN_IN");
  assert.equal(third.body.needsSignIn, true);
  assert.equal(third.body.needsUpgrade, false);
  assert.equal(third.body.canUseOwnKey, true);
  assert.match(third.body.error, /Sign in with Google to get 3 more/);
});

await test("a cache hit is served without touching the quota", async () => {
  const { env } = makeWorld({ anonTrial: 2 });
  const image = freshImage();
  const first = await resolveWith(env, { image });
  assert.equal(first.body.cached, false);
  assert.equal(first.body.quota.used, 1);
  const again = await resolveWith(env, { image });
  assert.equal(again.body.cached, true);
  assert.equal(again.body.quota.used, 1, "replaying the same frame is free");
});

console.log("\nQuota: signed-in trial → credits → paywall");

await test("the trial is FREE_TRIAL_SCANS lifetime, then credits are spent, then 402 with upgradeUrl", async () => {
  const { env, users } = makeWorld({ freeTrial: 3 });
  const auth = { token: "tok-free", installId: "install-free-0001" };

  for (let i = 1; i <= 3; i++) {
    const r = await resolveWith(env, auth);
    assert.equal(r.status, 200, `trial scan ${i}`);
    assert.equal(r.body.quota.plan, "free");
    assert.equal(r.body.quota.used, i);
    assert.equal(r.body.quota.credits, 2, "credits untouched while the trial lasts");
  }

  const fromCredits1 = await resolveWith(env, auth);
  assert.equal(fromCredits1.status, 200);
  assert.equal(fromCredits1.body.quota.remaining, 0);
  assert.equal(fromCredits1.body.quota.credits, 1);
  assert.equal(users.get("usr_free").scan_credits, 1);

  const fromCredits2 = await resolveWith(env, auth);
  assert.equal(fromCredits2.status, 200);
  assert.equal(fromCredits2.body.quota.credits, 0);
  assert.equal(fromCredits2.body.quota.exhausted, true);

  const wall = await resolveWith(env, auth);
  assert.equal(wall.status, 402);
  assert.equal(wall.body.code, "QUOTA_EXHAUSTED");
  assert.equal(wall.body.needsUpgrade, true);
  assert.equal(wall.body.needsSignIn, false);
  assert.equal(wall.body.canUseOwnKey, true);
  assert.equal(wall.body.upgradeUrl, "https://streamsnap.online/account.html#shopper-plans");
  assert.match(wall.body.error, /Buy a scan pack .* or add your own Gemini key/);
  assert.equal(wall.body.quota.available, 0);
});

await test("/auth/me exposes the same quota summary (used/limit/credits/available)", async () => {
  const { env } = makeWorld({ freeTrial: 3 });
  await resolveWith(env, { token: "tok-free", installId: "install-free-0001" });
  const me = await call(env, "/auth/me", { method: "GET", headers: { Authorization: "Bearer tok-free" } });
  assert.equal(me.status, 200);
  assert.equal(me.body.signedIn, true);
  assert.deepEqual(
    { used: me.body.quota.used, limit: me.body.quota.limit, credits: me.body.quota.credits, available: me.body.quota.available },
    { used: 1, limit: 3, credits: 2, available: 4 }
  );
});

console.log("\nBring your own key");

await test("X-Gemini-Key scans are never metered and never fall back onto Workers AI", async () => {
  const { env, ai } = makeWorld({ anonTrial: 0 });
  // Anonymous allowance is zero, so without a key this would be a 402.
  const blocked = await resolveWith(env);
  assert.equal(blocked.status, 402);

  const byo = await resolveWith(env, { geminiKey: "AIza-user-key" });
  assert.equal(byo.status, 200);
  assert.equal(byo.body.byoKey, true);
  assert.equal(byo.body.quota, null);
  assert.equal(byo.body.engine, "gemini");
  assert.equal(ai.calls, 0, "our Workers AI budget is untouched");
});

await test("a rejected key surfaces as 401 BYO_KEY_REJECTED instead of silently using our models", async () => {
  const { env, ai } = makeWorld({ anonTrial: 0 });
  geminiMode = "rejected";
  try {
    const r = await resolveWith(env, { geminiKey: "AIza-bad" });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, "BYO_KEY_REJECTED");
    assert.match(r.body.error, /rejected your Gemini API key/);
    assert.equal(ai.calls, 0);
  } finally {
    geminiMode = "ok";
  }
});

console.log("\nBilling");

await test("GET /billing/packages is public and says whether purchases are live", async () => {
  const { env } = makeWorld();
  const r = await call(env, "/billing/packages", { method: "GET" });
  assert.equal(r.status, 200);
  assert.equal(r.body.purchasesEnabled, false);
  assert.equal(r.body.byoKeySupported, true);
  assert.equal(r.body.freeTrialScans, 3);
  assert.equal(r.body.packages.length, PACKAGES.length);
  assert.ok(r.body.packages.every((p) => p.id && p.credits > 0 && p.amountCents > 0));
});

await test("checkout without Stripe configured answers 503 PURCHASES_DISABLED (and points at BYO key)", async () => {
  const { env } = makeWorld();
  const r = await call(env, "/billing/checkout", { headers: { Authorization: "Bearer tok-free" }, body: { packageId: "pack_1000" } });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "PURCHASES_DISABLED");
  assert.match(r.body.error, /own Gemini key/);
});

await test("checkout with Stripe creates a payment session carrying userId + packageId metadata", async () => {
  const { env } = makeWorld({ stripeKey: "sk_test_x" });
  stripeCalls.length = 0;
  const r = await call(env, "/billing/checkout", { headers: { Authorization: "Bearer tok-free" }, body: { packageId: "pack_1000" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.url, "https://checkout.stripe.com/c/pay/cs_test_123");
  const form = new URLSearchParams(stripeCalls[0].init.body);
  assert.equal(form.get("mode"), "payment");
  assert.equal(form.get("metadata[userId]"), "usr_free");
  assert.equal(form.get("metadata[packageId]"), "pack_1000");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "1499");
  assert.match(form.get("success_url"), /account\.html\?purchase=success&session_id=\{CHECKOUT_SESSION_ID\}#shopper-plans$/);
  assert.equal(stripeCalls[0].init.headers.Authorization, "Bearer sk_test_x");
});

await test("checkout requires a signed-in user", async () => {
  const { env } = makeWorld({ stripeKey: "sk_test_x" });
  const r = await call(env, "/billing/checkout", { body: { packageId: "pack_200" } });
  assert.equal(r.status, 401);
});

await test("a signed Stripe webhook grants the pack once; a replay is a no-op; a bad signature is rejected", async () => {
  const { env, users, DB } = makeWorld({ stripeKey: "sk_test_x", webhookSecret: "whsec_test" });
  const event = {
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_777", payment_status: "paid", amount_total: 499, currency: "usd", metadata: { userId: "usr_free", packageId: "pack_200" } } }
  };
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "whsec_test").update(`${t}.${raw}`).digest("hex");

  const ok = await call(env, "/billing/webhook", { raw, headers: { "Stripe-Signature": `t=${t},v1=${sig}` } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.granted, true);
  assert.equal(users.get("usr_free").scan_credits, 202);
  assert.equal(DB.purchases.length, 1);

  const replay = await call(env, "/billing/webhook", { raw, headers: { "Stripe-Signature": `t=${t},v1=${sig}` } });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.duplicate, true);
  assert.equal(users.get("usr_free").scan_credits, 202, "no double grant");

  const forged = await call(env, "/billing/webhook", { raw, headers: { "Stripe-Signature": `t=${t},v1=${"0".repeat(64)}` } });
  assert.equal(forged.status, 400);
});

await test("verifyStripeSignature rejects stale timestamps", async () => {
  const raw = "{}";
  const t = Math.floor(Date.now() / 1000) - 3600;
  const sig = createHmac("sha256", "s").update(`${t}.${raw}`).digest("hex");
  assert.equal(await verifyStripeSignature(raw, `t=${t},v1=${sig}`, "s"), false);
  assert.equal(await verifyStripeSignature(raw, `t=${t},v1=${sig}`, "s", { now: t * 1000 }), true);
});

await test("/billing/confirm grants from the redirect session id, idempotently with the webhook", async () => {
  const { env, users } = makeWorld({ stripeKey: "sk_test_x" });
  const r = await call(env, "/billing/confirm", { headers: { Authorization: "Bearer tok-free" }, body: { sessionId: "cs_test_123" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.granted, true);
  assert.equal(users.get("usr_free").scan_credits, 1002);
  assert.equal(r.body.quota.credits, 1002);

  const again = await call(env, "/billing/confirm", { headers: { Authorization: "Bearer tok-free" }, body: { sessionId: "cs_test_123" } });
  assert.equal(again.body.duplicate, true);
  assert.equal(users.get("usr_free").scan_credits, 1002);
});

await test("the free self-serve /billing/upgrade is gone", async () => {
  const { env } = makeWorld();
  const r = await call(env, "/billing/upgrade", { headers: { Authorization: "Bearer tok-free" }, body: { plan: "pro" } });
  assert.equal(r.status, 410);
});

await test("an admin can grant credits by hand and it is audited", async () => {
  const { env, users, DB } = makeWorld();
  const r = await call(env, "/api/admin/users/usr_free/credits", {
    headers: { Authorization: "Bearer tok-admin" },
    body: { credits: 500, note: "paid via Bit" }
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.credits, 502);
  assert.equal(users.get("usr_free").scan_credits, 502);
  assert.equal(DB.purchases[0].provider, "manual");
  assert.ok(DB.auditLog.some((row) => row[1] === "user.credits_grant"));

  const denied = await call(env, "/api/admin/users/usr_free/credits", { headers: { Authorization: "Bearer tok-free" }, body: { credits: 5 } });
  assert.equal(denied.status, 404, "non-admins see nothing");
});

await test("toStripeForm flattens nested objects and arrays the way Stripe expects", () => {
  const form = toStripeForm({ a: 1, b: { c: "x" }, items: [{ q: 2 }] });
  assert.equal(form.toString(), "a=1&b%5Bc%5D=x&items%5B0%5D%5Bq%5D=2");
});

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
