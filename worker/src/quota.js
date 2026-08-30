/**
 * StreamSnap Platform — quotas.
 *
 * Replaces the old installId rate limit, which was unenforceable: the extension
 * generated that string itself, so anyone could mint a fresh one and scan
 * without limit. Quota now hangs off a real account.
 *
 * Anonymous users keep a small allowance so the extension can be tried before
 * signing up — requiring an account before the first result would cost far more
 * installs than the free scans cost us.
 */

export const PLAN_QUOTAS = {
  anon: 10, // lifetime, not monthly — a taste, then sign up
  free: 100, // per month
  pro: 2000 // per month
};

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Effective monthly allowance: an admin override beats the plan default. */
export function quotaFor(user) {
  if (!user) return PLAN_QUOTAS.anon;
  if (typeof user.quota_override === "number" && user.quota_override >= 0) {
    return user.quota_override;
  }
  return PLAN_QUOTAS[user.plan] ?? PLAN_QUOTAS.free;
}

function counterKey(user, anonId) {
  // Anonymous allowance is lifetime, so it deliberately has no month component.
  return user ? `q:${user.id}:${monthKey()}` : `q:anon:${anonId}`;
}

export async function getUsage(env, user, anonId) {
  const raw = await env.CACHE.get(counterKey(user, anonId));
  return parseInt(raw || "0", 10);
}

/**
 * Check the allowance without consuming it.
 *
 * Cache hits are never counted — they cost us nothing upstream, so charging a
 * user for one would be arbitrary, and it would penalise exactly the behaviour
 * we want (rescanning a scene that has not changed).
 */
export async function checkQuota(env, user, anonId) {
  const limit = quotaFor(user);
  const used = await getUsage(env, user, anonId);

  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      reason: user
        ? `You have used all ${limit} scans this month.`
        : `Free trial used up (${limit} scans). Sign in to keep going.`,
      needsSignIn: !user
    };
  }

  return { allowed: true, used, limit, remaining: limit - used };
}

/** Consume one unit. Call only after a billable upstream call succeeds. */
export async function consumeQuota(env, user, anonId) {
  const key = counterKey(user, anonId);
  const used = parseInt((await env.CACHE.get(key)) || "0", 10);

  // Anonymous counters never expire; user counters roll with the month.
  const ttl = user ? 60 * 60 * 24 * 40 : 60 * 60 * 24 * 365;
  await env.CACHE.put(key, String(used + 1), { expirationTtl: ttl });

  return used + 1;
}

/**
 * Record what happened, for billing, quota display and — most usefully — for
 * finding which categories the detector keeps failing on.
 */
export async function recordUsage(env, { user, anonId, kind, cached, resultCount, category, latencyMs, error }) {
  try {
    await env.DB.prepare(
      `INSERT INTO usage_events
         (user_id, anon_id, kind, cached, billable, result_count, category, latency_ms, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        user?.id ?? null,
        user ? null : anonId ?? null,
        kind,
        cached ? 1 : 0,
        cached ? 0 : 1,
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
