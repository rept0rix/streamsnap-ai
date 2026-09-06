-- StreamSnap Platform — Migration 0003: Scan credits & purchases
--
-- Applied with:
--   npx wrangler d1 migrations apply streamsnap --local   (development)
--   npx wrangler d1 migrations apply streamsnap --remote  (production)
--
-- The free trial (FREE_TRIAL_SCANS, default 100) is a lifetime counter in KV.
-- Once it is gone a user either buys a scan pack — credits below — or scans
-- with their own Gemini key, which is never metered.

-- ---------------------------------------------------------------------------
-- 1. Purchased scan credits live on the user row. Consumed one per billable
--    scan after the trial is exhausted. Never expire.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN scan_credits INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. Purchase ledger. provider_ref is the Stripe Checkout Session id and is
--    UNIQUE so a replayed webhook can never grant credits twice.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id            TEXT PRIMARY KEY,                       -- pur_<random>
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  package_id    TEXT NOT NULL,                          -- see billing.js PACKAGES
  credits       INTEGER NOT NULL,
  amount_cents  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'usd',
  provider      TEXT NOT NULL
                CHECK (provider IN ('stripe', 'manual')),
  provider_ref  TEXT UNIQUE,                            -- Stripe session id; NULL for manual grants
  granted_by    TEXT REFERENCES users (id),             -- admin id for manual grants
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_user_time ON purchases (user_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Usage events learn whether a scan ran on the caller's own key (cost us
--    nothing) and which engine answered, so cost and quality can be split.
-- ---------------------------------------------------------------------------
ALTER TABLE usage_events ADD COLUMN byo_key INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN engine TEXT;
