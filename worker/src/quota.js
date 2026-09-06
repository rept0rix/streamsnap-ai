/**
 * StreamSnap Platform — quotas and scan credits.
 *
 * Every scan that runs on *our* Gemini key is metered. The ladder a caller
 * climbs, in order:
 *
 *   1. Anonymous teaser   — a handful of lifetime scans keyed on the install
 *                           id, so the extension shows a result before asking
 *                           for anything. Deliberately tiny: the install id is
 *                           minted client-side and trivially reset.
 *   2. Free trial         — FREE_TRIAL_SCANS lifetime scans (default 100) once
 *                           signed in with Google. Lifetime, not monthly: this
 *                           is a trial of the product, not a free tier.
 *   3. Purchased credits  — scan packs bought on the account page (or granted
 *                           by an admin). Never expire, consumed one per scan
 *                           once the trial is gone.
 *   4. Pro plan           — a monthly allowance for subscribers, admin-set.
 *
 * Callers who bring their own Gemini key (X-Gemini-Key) skip all of this: the
 * upstream call costs us nothing, so nothing is metered.
 *
 * Cache hits are never counted either — they cost us nothing upstream, and
 * charging for them would penalise exactly the behaviour we want (rescanning
 * a scene that has not changed).
 */

export const PLAN_QUOTAS = {
  anon: 10, // lifetime teaser before sign-in
  free: 100, // lifetime trial after sign-in (override with FREE_TRIAL_SCANS)
  pro: 2000 // per month
};

export const QUOTA_CODES = {
  ANON_EXHAUSTED: "TRIAL_EXHAUSTED_SIGN_IN",
  USER_EXHAUSTED: "QUOTA_EXHAUSTED"
};

function envInt(env, name, fallback) {
  const raw = Number.parseInt(String(env?.[name] ?? ""), 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export function freeTrialSize(env) {
  return envInt(env, "FREE_TRIAL_SCANS", PLAN_QUOTAS.free);
}

export function anonTrialSize(env) {
  return envInt(env, "ANON_TRIAL_SCANS", PLAN_QUOTAS.anon);
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The allowance a caller gets before purchased credits are touched.
 *
 * `period` tells the client how to phrase it: a lifetime trial says
 * "87 of 100 free scans left", a monthly plan says "this month".
 */
export function allowanceFor(env, user) {
  if (!user) return { limit: anonTrialSize(env), period: "lifetime", plan: "anon" };
  if (typeof user.quota_override === "number" && user.quota_override >= 0) {
    return { limit: user.quota_override, period: "month", plan: user.plan || "free" };
  }
  if (user.plan === "pro") return { limit: PLAN_QUOTAS.pro, period: "month", plan: "pro" };
  return { limit: freeTrialSize(env), period: "lifetime", plan: "free" };
}

/** Kept for callers that only need the number. */
export function quotaFor(env, user) {
  return allowanceFor(env, user).limit;
}

function counterKey(env, user, anonId) {
  if (!user) return `q:anon:${anonId}`;
  const { period } = allowanceFor(env, user);
  return period === "lifetime" ? `q:${user.id}:trial` : `q:${user.id}:${monthKey()}`;
}

export function creditsOf(user) {
  const n = Number(user?.scan_credits);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function getUsage(env, user, anonId) {
  if (!env?.CACHE) return 0;
  const raw = await env.CACHE.get(counterKey(env, user, anonId));
  return parseInt(raw || "0", 10);
}

/**
 * One object that every surface (extension, mobile, account page) renders from.
 */
export async function quotaSummary(env, user, anonId) {
  const { limit, period, plan } = allowanceFor(env, user);
  const used = await getUsage(env, user, anonId);
  const credits = creditsOf(user);
  const remaining = Math.max(0, limit - used);
  return {
    plan,
    period,
    used: Math.min(used, limit),
    limit,
    remaining,
    credits,
    // What the caller can still spend right now, from any source.
    available: remaining + credits,
    exhausted: remaining === 0 && credits === 0,
    signedIn: Boolean(user)
  };
}

/**
 * Check the allowance without consuming it.
 *
 * `source` says which bucket the next scan will draw from so consumeQuota can
 * hit the same one — the allowance counter lives in KV, credits live in D1.
 */
export async function checkQuota(env, user, anonId) {
  const summary = await quotaSummary(env, user, anonId);

  if (summary.remaining > 0) {
    return { allowed: true, source: "allowance", ...summary };
  }
  if (summary.credits > 0) {
    return { allowed: true, source: "credits", ...summary };
  }

  if (!user) {
    return {
      allowed: false,
      code: QUOTA_CODES.ANON_EXHAUSTED,
      needsSignIn: true,
      needsUpgrade: false,
      reason: `You've used your ${summary.limit} free scans. Sign in with Google to get ${freeTrialSize(env)} more.`,
      ...summary
    };
  }

  return {
    allowed: false,
    code: QUOTA_CODES.USER_EXHAUSTED,
    needsSignIn: false,
    needsUpgrade: true,
    reason:
      summary.period === "month"
        ? `You've used all ${summary.limit} scans this month. Buy a scan pack to keep going, or add your own Gemini key.`
        : `Your ${summary.limit} free scans are used up. Buy a scan pack to keep going, or add your own Gemini key for unlimited scans.`,
    ...summary
  };
}

/**
 * Consume one unit from the bucket checkQuota picked. Call only after a
 * billable upstream call succeeded.
 */
export async function consumeQuota(env, user, anonId, source = "allowance") {
  if (source === "credits" && user && env?.DB) {
    // The guard keeps a race between two concurrent scans from going negative.
    const res = await env.DB.prepare(
      "UPDATE users SET scan_credits = scan_credits - 1 WHERE id = ? AND scan_credits > 0"
    )
      .bind(user.id)
      .run();
    if (res?.meta?.changes === 0) {
      // Credits vanished between check and consume; fall back to the counter so
      // the scan is still accounted for somewhere.
      return consumeQuota(env, user, anonId, "allowance");
    }
    return { source: "credits", credits: Math.max(0, creditsOf(user) - 1) };
  }

  if (!env?.CACHE) return { source: "allowance", used: 0 };
  const key = counterKey(env, user, anonId);
  const used = parseInt((await env.CACHE.get(key)) || "0", 10);

  // Lifetime counters must outlive any plausible account; monthly ones roll.
  const { period } = allowanceFor(env, user);
  const ttl = period === "month" ? 60 * 60 * 24 * 40 : 60 * 60 * 24 * 365 * 5;
  await env.CACHE.put(key, String(used + 1), { expirationTtl: ttl });

  return { source: "allowance", used: used + 1 };
}

/** Grant (or, with a negative delta, revoke) purchased credits. */
export async function addCredits(env, userId, delta) {
  const amount = Math.trunc(Number(delta));
  if (!Number.isFinite(amount) || amount === 0) return creditsOf(await getUserRow(env, userId));
  await env.DB.prepare(
    "UPDATE users SET scan_credits = MAX(0, COALESCE(scan_credits, 0) + ?) WHERE id = ?"
  )
    .bind(amount, userId)
    .run();
  return creditsOf(await getUserRow(env, userId));
}

async function getUserRow(env, userId) {
  return env.DB.prepare("SELECT scan_credits FROM users WHERE id = ?").bind(userId).first();
}

/**
 * Record what happened, for billing, quota display and — most usefully — for
 * finding which categories the detector keeps failing on. `byoKey` separates
 * scans that cost us nothing from the ones that did.
 */
export async function recordUsage(
  env,
  { user, anonId, kind, cached, byoKey, engine, resultCount, category, latencyMs, error }
) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO usage_events
         (user_id, anon_id, kind, cached, billable, byo_key, engine, result_count, category, latency_ms, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        user?.id ?? null,
        user ? null : anonId ?? null,
        kind,
        cached ? 1 : 0,
        cached || byoKey ? 0 : 1,
        byoKey ? 1 : 0,
        engine ?? null,
        resultCount ?? 0,
        category ?? null,
        latencyMs ?? null,
        error ?? null
      )
      .run();
  } catch (err) {
    // Usage logging is observability, not correctness. Never fail a user's
    // scan because the write failed.
    console.error("[usage] insert failed:", err);
  }
}
