-- StreamSnap Platform — Migration 0002: Multi-Device Sync & Streamers
--
-- Applied with:
--   npx wrangler d1 migrations apply streamsnap --local   (development)
--   npx wrangler d1 migrations apply streamsnap --remote  (production)

-- ---------------------------------------------------------------------------
-- 1. Upgrade users table to support 'streamer' role and streamer metadata
-- ---------------------------------------------------------------------------
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users_new (
  id                TEXT PRIMARY KEY,           -- usr_<random>
  email             TEXT NOT NULL UNIQUE,
  name              TEXT,
  avatar_url        TEXT,
  google_sub        TEXT UNIQUE,

  role              TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'streamer', 'admin')),
  plan              TEXT NOT NULL DEFAULT 'free'
                    CHECK (plan IN ('free', 'pro')),

  quota_override    INTEGER,
  affiliate_tag     TEXT,
  is_streamer       INTEGER NOT NULL DEFAULT 0,
  streamer_verified INTEGER NOT NULL DEFAULT 0,
  stream_channels   TEXT,                       -- JSON string: { youtube, twitch, kick, tiktok }
  blocked_at        TEXT,                       -- ISO8601; non-null = blocked
  blocked_reason    TEXT,

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at      TEXT
);

INSERT OR IGNORE INTO users_new (
  id, email, name, avatar_url, google_sub, role, plan,
  quota_override, affiliate_tag, blocked_at, blocked_reason,
  created_at, last_seen_at
)
SELECT
  id, email, name, avatar_url, google_sub, role, plan,
  quota_override, affiliate_tag, blocked_at, blocked_reason,
  created_at, last_seen_at
FROM users;

DROP TABLE IF EXISTS users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_streamer ON users (is_streamer) WHERE is_streamer = 1;

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 2. Multi-Device and Active Session Registry (user_devices)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_devices (
  id              TEXT PRIMARY KEY,              -- dev_<random>
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_type     TEXT NOT NULL CHECK (device_type IN ('extension', 'mobile', 'web')),
  device_name     TEXT NOT NULL,                 -- e.g. "Chrome Extension v1.6.0", "iPhone 15 Pro", "Web Dashboard"
  platform_os     TEXT,                          -- "macOS", "Windows", "iOS", "Android", "Linux"
  ip_address      TEXT,
  geo_country     TEXT,
  is_online       INTEGER NOT NULL DEFAULT 1,    -- 1 = online, 0 = offline
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'revoked')),
  last_active_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON user_devices (user_id, last_active_at);
CREATE INDEX IF NOT EXISTS idx_devices_online ON user_devices (is_online, device_type);

-- ---------------------------------------------------------------------------
-- 3. Live Searches & Visual Detections Stream (user_searches)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_searches (
  id                    TEXT PRIMARY KEY,        -- srch_<random>
  user_id               TEXT REFERENCES users (id) ON DELETE CASCADE,
  device_type           TEXT NOT NULL DEFAULT 'web',
  stream_platform       TEXT,                    -- 'youtube', 'twitch', 'tiktok', 'kick', 'camera', 'web'
  stream_channel_or_url TEXT,
  detected_query        TEXT NOT NULL,
  matched_asin          TEXT,
  product_title         TEXT,
  confidence_score      INTEGER,
  source_frame_url      TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_searches_user ON user_searches (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_searches_time ON user_searches (created_at);
CREATE INDEX IF NOT EXISTS idx_searches_platform ON user_searches (stream_platform);

-- ---------------------------------------------------------------------------
-- 4. Cross-Device Cart & Orders Sync (user_cart_items)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_cart_items (
  id              TEXT PRIMARY KEY,              -- cart_<random>
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  asin            TEXT NOT NULL,
  title           TEXT NOT NULL,
  price           REAL,
  image_url       TEXT,
  product_url     TEXT,
  affiliate_tag   TEXT,
  quantity        INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'checked_out', 'removed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_cart_asin ON user_cart_items (user_id, asin) WHERE status = 'staged';
CREATE INDEX IF NOT EXISTS idx_cart_user ON user_cart_items (user_id, status);

-- ---------------------------------------------------------------------------
-- 5. Streamer Gear Showcase (streamer_gear)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS streamer_gear (
  id              TEXT PRIMARY KEY,              -- gear_<random>
  streamer_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'Setup', -- 'Microphone', 'Camera', 'Headphones', 'Lighting', 'Chair', 'Apparel'
  asin            TEXT,
  price           REAL,
  image_url       TEXT,
  product_url     TEXT,
  clicks_count    INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gear_streamer ON streamer_gear (streamer_id, active);
