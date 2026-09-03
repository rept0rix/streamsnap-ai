/**
 * StreamSnap Platform — Cross-Platform Synchronization & Multi-Device Registry
 *
 * Handles:
 *  - Device Registration & Live Heartbeats (Web, Chrome Extension, Mobile)
 *  - Unified State Sync (Products, Cart, Searches, Settings)
 *  - Client Mutation Events
 *  - Streamer Gear Hub (Gear Bag & Public Viewer Feeds)
 */

import { requireUser, AuthError } from "./auth.js";

function randomId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function handleSyncRoute(request, env, url, json) {
  const path = url.pathname;

  // ---------------------------------------------------------------------------
  // Public Gear Query: Viewers scanning a stream can fetch that streamer's gear
  // ---------------------------------------------------------------------------
  if (path === "/creator/gear/public" && request.method === "GET") {
    const streamerId = url.searchParams.get("streamer_id");
    const channelName = url.searchParams.get("channel");

    let query = "SELECT * FROM streamer_gear WHERE active = 1";
    const params = [];

    if (streamerId) {
      query += " AND streamer_id = ?";
      params.push(streamerId);
    } else if (channelName) {
      // Find streamer by channel handle inside stream_channels JSON or affiliate_tag
      const streamer = await env.DB.prepare(
        `SELECT id, name, affiliate_tag FROM users
         WHERE stream_channels LIKE ? OR affiliate_tag = ? LIMIT 1`
      ).bind(`%${channelName}%`, channelName).first();

      if (streamer) {
        query += " AND streamer_id = ?";
        params.push(streamer.id);
      } else {
        return json({ ok: true, gear: [], streamer: null }, 200, request, env);
      }
    } else {
      query += " ORDER BY clicks_count DESC LIMIT 20";
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return json({ ok: true, gear: results || [] }, 200, request, env);
  }

  // All other endpoints require authentication
  let user;
  try {
    user = await requireUser(env, request);
  } catch (err) {
    return json({ ok: false, error: err.message }, err.status || 401, request, env);
  }

  const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "127.0.0.1";
  const geoCountry = request.headers.get("CF-IPCountry") || "US";

  // ---------------------------------------------------------------------------
  // 1. Device Registration (POST /auth/device/register)
  // ---------------------------------------------------------------------------
  if (path === "/auth/device/register" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const rawType = String(body.deviceType || "web").toLowerCase();
    const deviceType = ["extension", "mobile", "web"].includes(rawType) ? rawType : "web";
    const deviceName = String(body.deviceName || `StreamSnap ${deviceType.toUpperCase()}`).slice(0, 100);
    const platformOs = String(body.platformOs || "Unknown").slice(0, 50);
    const deviceId = body.deviceId || randomId("dev");

    await env.DB.prepare(`
      INSERT INTO user_devices (id, user_id, device_type, device_name, platform_os, ip_address, geo_country, is_online, status, last_active_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'active', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        device_name = excluded.device_name,
        platform_os = excluded.platform_os,
        ip_address = excluded.ip_address,
        geo_country = excluded.geo_country,
        is_online = 1,
        status = 'active',
        last_active_at = datetime('now')
    `).bind(deviceId, user.id, deviceType, deviceName, platformOs, clientIp, geoCountry).run();

    // Cache active presence in KV for instant lookups
    if (env.CACHE) {
      await env.CACHE.put(`presence:${user.id}:${deviceId}`, JSON.stringify({
        deviceType,
        deviceName,
        onlineAt: Date.now()
      }), { expirationTtl: 300 });
    }

    return json({ ok: true, deviceId, deviceType, deviceName, status: "active" }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 2. Device Heartbeat (POST /auth/device/heartbeat)
  // ---------------------------------------------------------------------------
  if (path === "/auth/device/heartbeat" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const deviceId = body.deviceId;
    if (!deviceId) return json({ ok: false, error: "deviceId required" }, 400, request, env);

    await env.DB.prepare(`
      UPDATE user_devices
      SET is_online = 1, status = 'active', last_active_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(deviceId, user.id).run();

    await env.DB.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).bind(user.id).run();

    if (env.CACHE) {
      await env.CACHE.put(`presence:${user.id}:${deviceId}`, "1", { expirationTtl: 300 });
    }

    return json({ ok: true, heartbeat: "ack" }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 3. User Devices List & Management (GET /auth/devices, DELETE /auth/devices/:id)
  // ---------------------------------------------------------------------------
  if (path === "/auth/devices" && request.method === "GET") {
    const { results } = await env.DB.prepare(`
      SELECT id, device_type, device_name, platform_os, ip_address, geo_country,
             is_online, status, last_active_at, created_at
      FROM user_devices
      WHERE user_id = ?
      ORDER BY last_active_at DESC
    `).bind(user.id).all();

    return json({ ok: true, devices: results || [] }, 200, request, env);
  }

  const deviceMatch = path.match(/^\/auth\/devices\/([^/]+)$/);
  if (deviceMatch && request.method === "DELETE") {
    const targetDevId = deviceMatch[1];
    await env.DB.prepare(`
      UPDATE user_devices
      SET status = 'revoked', is_online = 0
      WHERE id = ? AND user_id = ?
    `).bind(targetDevId, user.id).run();

    if (env.CACHE) {
      await env.CACHE.delete(`presence:${user.id}:${targetDevId}`);
    }

    return json({ ok: true, revoked: true, id: targetDevId }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 4. Unified Cross-Platform State Sync (GET /sync/state)
  // ---------------------------------------------------------------------------
  if (path === "/sync/state" && request.method === "GET") {
    // 1. Saved wishlist products
    const savedProducts = (await env.DB.prepare(
      "SELECT * FROM saved_products WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 100"
    ).bind(user.id).all())?.results || [];

    // 2. Cross-device cart
    const cartItems = (await env.DB.prepare(
      "SELECT * FROM user_cart_items WHERE user_id = ? AND status = 'staged' ORDER BY updated_at DESC"
    ).bind(user.id).all())?.results || [];

    // 3. Recent searches / visual scans
    const recentSearches = (await env.DB.prepare(
      "SELECT * FROM user_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 30"
    ).bind(user.id).all())?.results || [];

    // 4. User settings
    const settings = await env.DB.prepare(
      "SELECT * FROM user_settings WHERE user_id = ?"
    ).bind(user.id).first() || {
      min_confidence: 75,
      auto_scan_interval: 0,
      show_non_amazon: 0
    };

    // 5. Connected devices
    const devices = (await env.DB.prepare(
      "SELECT id, device_type, device_name, platform_os, is_online, status, last_active_at FROM user_devices WHERE user_id = ? AND status != 'revoked' ORDER BY last_active_at DESC"
    ).bind(user.id).all())?.results || [];

    // 6. Streamer gear (if user is creator/streamer)
    let gear = [];
    const isStreamer = user.role === "streamer" || user.is_streamer === 1;
    if (isStreamer) {
      gear = (await env.DB.prepare(
        "SELECT * FROM streamer_gear WHERE streamer_id = ? AND active = 1 ORDER BY created_at DESC"
      ).bind(user.id).all())?.results || [];
    }

    return json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        role: user.role,
        plan: user.plan,
        affiliateTag: user.affiliate_tag,
        isStreamer: Boolean(isStreamer),
        streamerVerified: Boolean(user.streamer_verified)
      },
      savedProducts,
      cartItems,
      recentSearches,
      settings,
      devices,
      gear
    }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 5. Cross-Platform Mutation Event Hub (POST /sync/event)
  // ---------------------------------------------------------------------------
  if (path === "/sync/event" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const event = String(body.event || "");
    const data = body.data || {};

    if (event === "cart.add") {
      const asin = String(data.asin || "").trim();
      const title = String(data.title || "Amazon Product").trim();
      if (!asin && !title) return json({ ok: false, error: "Product ASIN or title required" }, 400, request, env);

      const cartId = data.id || randomId("cart");
      await env.DB.prepare(`
        INSERT INTO user_cart_items (id, user_id, asin, title, price, image_url, product_url, affiliate_tag, quantity, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged', datetime('now'))
        ON CONFLICT(user_id, asin) DO UPDATE SET
          quantity = user_cart_items.quantity + 1,
          status = 'staged',
          price = COALESCE(excluded.price, user_cart_items.price),
          updated_at = datetime('now')
      `).bind(
        cartId,
        user.id,
        asin || `GEN_${Date.now()}`,
        title,
        typeof data.price === "number" ? data.price : null,
        data.imageUrl || null,
        data.productUrl || null,
        data.affiliateTag || user.affiliate_tag || null,
        data.quantity || 1
      ).run();

      return json({ ok: true, synced: "cart.add", id: cartId }, 200, request, env);
    }

    if (event === "cart.remove") {
      const asin = data.asin;
      const id = data.id;
      if (id) {
        await env.DB.prepare("UPDATE user_cart_items SET status = 'removed' WHERE id = ? AND user_id = ?").bind(id, user.id).run();
      } else if (asin) {
        await env.DB.prepare("UPDATE user_cart_items SET status = 'removed' WHERE asin = ? AND user_id = ?").bind(asin, user.id).run();
      }
      return json({ ok: true, synced: "cart.remove" }, 200, request, env);
    }

    if (event === "search.record") {
      const detectedQuery = String(data.query || data.detectedQuery || "").trim();
      if (!detectedQuery) return json({ ok: false, error: "Search query required" }, 400, request, env);

      const searchId = data.id || randomId("srch");
      await env.DB.prepare(`
        INSERT INTO user_searches (id, user_id, device_type, stream_platform, stream_channel_or_url, detected_query, matched_asin, product_title, confidence_score, source_frame_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        searchId,
        user.id,
        data.deviceType || "web",
        data.streamPlatform || "web",
        data.streamChannel || null,
        detectedQuery,
        data.matchedAsin || null,
        data.productTitle || null,
        typeof data.confidenceScore === "number" ? data.confidenceScore : null,
        data.sourceFrameUrl || null
      ).run();

      return json({ ok: true, synced: "search.record", id: searchId }, 200, request, env);
    }

    if (event === "product.save") {
      const title = String(data.title || "").trim();
      if (!title) return json({ ok: false, error: "Title required" }, 400, request, env);
      const prodId = data.id || randomId("prod");

      await env.DB.prepare(`
        INSERT INTO saved_products (id, user_id, asin, title, price, image_url, product_url, category, source, verified, sighting_count, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(user_id, COALESCE(asin, title)) DO UPDATE SET
          sighting_count = sighting_count + 1,
          last_seen_at = datetime('now'),
          price = COALESCE(excluded.price, saved_products.price),
          image_url = COALESCE(excluded.image_url, saved_products.image_url)
      `).bind(
        prodId,
        user.id,
        data.asin || null,
        title,
        typeof data.price === "number" ? data.price : null,
        data.imageUrl || null,
        data.productUrl || null,
        data.category || "General",
        data.source || "amazon",
        data.verified ? 1 : 0
      ).run();

      return json({ ok: true, synced: "product.save", id: prodId }, 200, request, env);
    }

    return json({ ok: false, error: "Unknown sync event" }, 400, request, env);
  }

  // ---------------------------------------------------------------------------
  // 6. Streamer Gear CRUD (GET, POST, DELETE /creator/gear)
  // ---------------------------------------------------------------------------
  if (path === "/creator/gear" && request.method === "GET") {
    const { results } = await env.DB.prepare(`
      SELECT * FROM streamer_gear WHERE streamer_id = ? AND active = 1 ORDER BY created_at DESC
    `).bind(user.id).all();

    return json({ ok: true, gear: results || [] }, 200, request, env);
  }

  if (path === "/creator/gear" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    if (!title) return json({ ok: false, error: "Gear item title is required" }, 400, request, env);

    const gearId = randomId("gear");
    await env.DB.prepare(`
      INSERT INTO streamer_gear (id, streamer_id, title, category, asin, price, image_url, product_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      gearId,
      user.id,
      title,
      body.category || "Setup",
      body.asin || null,
      typeof body.price === "number" ? body.price : null,
      body.imageUrl || null,
      body.productUrl || null
    ).run();

    // Ensure user has is_streamer flag set
    await env.DB.prepare("UPDATE users SET is_streamer = 1 WHERE id = ?").bind(user.id).run();

    return json({ ok: true, gear: { id: gearId, title, category: body.category || "Setup" } }, 200, request, env);
  }

  const gearMatch = path.match(/^\/creator\/gear\/([^/]+)$/);
  if (gearMatch && request.method === "DELETE") {
    const gearId = gearMatch[1];
    await env.DB.prepare("UPDATE streamer_gear SET active = 0 WHERE id = ? AND streamer_id = ?").bind(gearId, user.id).run();
    return json({ ok: true, deleted: true, id: gearId }, 200, request, env);
  }

  return null;
}
