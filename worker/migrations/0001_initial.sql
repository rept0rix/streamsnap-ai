-- StreamSnap Platform — initial schema
--
-- Applied with:
--   npx wrangler d1 migrations apply streamsnap --local   (development)
--   npx wrangler d1 migrations apply streamsnap --remote  (production)

-- ---------------------------------------------------------------------------
-- Users
--
-- No password column by design. Identity comes from Google OAuth, so there is
-- nothing to hash, reset, or leak. Adding email magic links later does not
-- change this table.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              TEXT PRIMARY KEY,           -- usr_<random>
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  avatar_url      TEXT,
  google_sub      TEXT UNIQUE,                -- stable Google account id

  role            TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user', 'admin')),
  plan            TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'pro')),

  -- NULL means "use the plan default". A number here is an admin override,
  -- which is why the override reason lives in audit_log.
  quota_override  INTEGER,

  affiliate_tag   TEXT,
  blocked_at      TEXT,                       -- ISO8601; non-null = blocked
  blocked_reason  TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_google_sub ON users (google_sub);
CREATE INDEX idx_users_role ON users (role) WHERE role = 'admin';

-- ---------------------------------------------------------------------------
-- Per-user extension settings
--
-- Kept out of users so the extension can sync the whole blob without touching
-- identity or billing columns.
-- ---------------------------------------------------------------------------
CREATE TABLE user_settings (
  user_id            TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  min_confidence     INTEGER NOT NULL DEFAULT 75,
  auto_scan_interval INTEGER NOT NULL DEFAULT 0,   -- seconds; 0 = manual
  show_non_amazon    INTEGER NOT NULL DEFAULT 0,   -- boolean
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Usage
--
-- One row per resolve attempt. Deliberately records no imagery, no page URL and
-- no stream title -- only what is needed to bill, to enforce quota, and to see
-- which categories the detector fails on.
-- ---------------------------------------------------------------------------
CREATE TABLE usage_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT REFERENCES users (id) ON DELETE CASCADE,  -- NULL = anonymous
  anon_id       TEXT,                          -- pre-signup install id

  kind          TEXT NOT NULL
                CHECK (kind IN ('resolve', 'crop', 'frame')),
  cached        INTEGER NOT NULL DEFAULT 0,
  billable      INTEGER NOT NULL DEFAULT 1,    -- cache hits cost us nothing
  result_count  INTEGER NOT NULL DEFAULT 0,
  category      TEXT,
  latency_ms    INTEGER,
  error         TEXT,

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_usage_user_time ON usage_events (user_id, created_at);
CREATE INDEX idx_usage_time ON usage_events (created_at);
-- Supports "which categories return nothing", the core product-quality question.
CREATE INDEX idx_usage_failures ON usage_events (category, result_count)
  WHERE result_count = 0;

-- ---------------------------------------------------------------------------
-- Verified product catalog
--
-- Replaces the hardcoded VERIFIED_PRODUCTS object in amazon_service.js.
--
-- An entry here is authoritative: its title and price override whatever the
-- vision model claimed, and it earns a direct /dp/ link. An unchecked row is
-- therefore worse than no row at all -- it is a broken link wearing a
-- "verified" badge. verified_by and verified_at exist so that can never again
-- happen silently.
-- ---------------------------------------------------------------------------
CREATE TABLE catalog_products (
  asin          TEXT PRIMARY KEY
                CHECK (length(asin) = 10 AND asin LIKE 'B0%'),
  title         TEXT NOT NULL,
  brand         TEXT,
  category      TEXT NOT NULL,
  price         REAL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  image_url     TEXT,

  verified_by   TEXT REFERENCES users (id),
  verified_at   TEXT NOT NULL DEFAULT (datetime('now')),
  -- How the ASIN was confirmed to be the correct live listing.
  verify_method TEXT NOT NULL DEFAULT 'manual'
                CHECK (verify_method IN ('manual', 'lens', 'creators_api')),
  last_checked  TEXT,
  active        INTEGER NOT NULL DEFAULT 1,

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_catalog_active ON catalog_products (active, category);
CREATE INDEX idx_catalog_stale ON catalog_products (last_checked) WHERE active = 1;

-- ---------------------------------------------------------------------------
-- Admin audit
--
-- Every privileged action, including impersonation. Cheap to add now and
-- painful to backfill once a second admin exists.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT NOT NULL REFERENCES users (id),
  action      TEXT NOT NULL,       -- 'quota.override', 'user.block', 'catalog.add', ...
  target_type TEXT,                -- 'user' | 'product'
  target_id   TEXT,
  detail      TEXT,                -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_time ON audit_log (created_at);
CREATE INDEX idx_audit_actor ON audit_log (actor_id, created_at);
CREATE INDEX idx_audit_target ON audit_log (target_type, target_id);

-- ---------------------------------------------------------------------------
-- Saved products, so history survives a cleared browser or a new device.
-- ---------------------------------------------------------------------------
CREATE TABLE saved_products (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  asin           TEXT,
  title          TEXT NOT NULL,
  price          REAL,
  image_url      TEXT,
  product_url    TEXT,
  category       TEXT,
  source         TEXT,                           -- 'amazon' | retailer host
  verified       INTEGER NOT NULL DEFAULT 0,
  sighting_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_saved_user ON saved_products (user_id, last_seen_at);
-- One row per product per user; a re-sighting bumps the counter instead.
CREATE UNIQUE INDEX idx_saved_dedup ON saved_products (user_id, COALESCE(asin, title));
