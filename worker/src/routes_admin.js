/**
 * StreamSnap Platform — Master Admin & Multi-Device Control Cockpit
 *
 * All endpoints here require active admin credentials via `requireAdmin`.
 * Privilege elevation, role changes, plan overrides, device revocations,
 * and account blocks are strictly audited in `audit_log`.
 */

import { requireAdmin, audit, AuthError } from "./auth.js";

export async function handleAdminRoute(request, env, url, json) {
  const path = url.pathname;
  if (!path.startsWith("/api/admin")) return null;

  let admin;
  try {
    admin = await requireAdmin(env, request);
  } catch (err) {
    return json({ ok: false, error: err.message }, err.status || 401, request, env);
  }

  // ---------------------------------------------------------------------------
  // 1. GET /api/admin/stats & /api/admin/overview
  // ---------------------------------------------------------------------------
  if ((path === "/api/admin/stats" || path === "/api/admin/overview") && request.method === "GET") {
    const totalUsers = (await env.DB.prepare("SELECT COUNT(*) as count FROM users").first())?.count || 0;
    const proUsers = (await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE plan = 'pro'").first())?.count || 0;
    const streamerUsers = (await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'streamer' OR is_streamer = 1").first())?.count || 0;
    const adminUsers = (await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first())?.count || 0;
    const blockedUsers = (await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE blocked_at IS NOT NULL").first())?.count || 0;

    // Active devices in last 10 minutes
    const onlineDevicesTotal = (await env.DB.prepare(
      "SELECT COUNT(*) as count FROM user_devices WHERE is_online = 1 AND datetime(last_active_at) >= datetime('now', '-10 minutes')"
    ).first())?.count || 0;

    const extensionDevices = (await env.DB.prepare(
      "SELECT COUNT(*) as count FROM user_devices WHERE device_type = 'extension' AND is_online = 1 AND datetime(last_active_at) >= datetime('now', '-10 minutes')"
    ).first())?.count || 0;

    const mobileDevices = (await env.DB.prepare(
      "SELECT COUNT(*) as count FROM user_devices WHERE device_type = 'mobile' AND is_online = 1 AND datetime(last_active_at) >= datetime('now', '-10 minutes')"
    ).first())?.count || 0;

    const webDevices = (await env.DB.prepare(
      "SELECT COUNT(*) as count FROM user_devices WHERE device_type = 'web' AND is_online = 1 AND datetime(last_active_at) >= datetime('now', '-10 minutes')"
    ).first())?.count || 0;

    // Scans & Searches
    const scansToday = (await env.DB.prepare("SELECT COUNT(*) as count FROM usage_events WHERE date(created_at) = date('now')").first())?.count || 0;
    const scansTotal = (await env.DB.prepare("SELECT COUNT(*) as count FROM usage_events").first())?.count || 0;
    const cachedScans = (await env.DB.prepare("SELECT COUNT(*) as count FROM usage_events WHERE cached = 1").first())?.count || 0;

    const totalSavedProducts = (await env.DB.prepare("SELECT COUNT(*) as count FROM saved_products").first())?.count || 0;
    const totalCartItems = (await env.DB.prepare("SELECT COUNT(*) as count FROM user_cart_items WHERE status = 'staged'").first())?.count || 0;

    // Recent activity users
    const recentActivity = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.role, u.plan, u.last_seen_at, u.is_streamer,
              (SELECT COUNT(*) FROM user_devices d WHERE d.user_id = u.id AND d.is_online = 1) as online_device_count
       FROM users u
       ORDER BY u.last_seen_at DESC NULLS LAST, u.created_at DESC
       LIMIT 8`
    ).all();

    return json(
      {
        ok: true,
        stats: {
          totalUsers,
          proUsers,
          streamerUsers,
          adminUsers,
          blockedUsers,
          scansToday,
          scansTotal,
          cachedScans,
          cacheHitRate: scansTotal > 0 ? Math.round((cachedScans / scansTotal) * 100) : 0,
          totalSavedProducts,
          totalCartItems,
          presence: {
            totalOnline: onlineDevicesTotal,
            extension: extensionDevices,
            mobile: mobileDevices,
            web: webDevices
          }
        },
        recentUsers: recentActivity.results || []
      },
      200,
      request,
      env
    );
  }

  // ---------------------------------------------------------------------------
  // 2. GET /api/admin/users
  // ---------------------------------------------------------------------------
  if (path === "/api/admin/users" && request.method === "GET") {
    const search = url.searchParams.get("search")?.trim() || "";
    const role = url.searchParams.get("role") || "all";
    const plan = url.searchParams.get("plan") || "all";
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push("(email LIKE ? OR name LIKE ? OR id LIKE ? OR affiliate_tag LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (role !== "all" && ["user", "streamer", "admin"].includes(role)) {
      whereClauses.push("role = ?");
      params.push(role);
    }
    if (plan !== "all" && ["free", "pro"].includes(plan)) {
      whereClauses.push("plan = ?");
      params.push(plan);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const totalCountQuery = `SELECT COUNT(*) as count FROM users ${whereStr}`;
    const totalCount = (await env.DB.prepare(totalCountQuery).bind(...params).first())?.count || 0;

    const usersQuery = `
      SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.plan, u.quota_override,
             u.affiliate_tag, u.is_streamer, u.streamer_verified, u.blocked_at, u.blocked_reason,
             u.created_at, u.last_seen_at,
             (SELECT COUNT(*) FROM usage_events e WHERE e.user_id = u.id) as scan_count,
             (SELECT COUNT(*) FROM user_devices d WHERE d.user_id = u.id AND d.is_online = 1) as online_device_count,
             (SELECT COUNT(*) FROM saved_products p WHERE p.user_id = u.id) as saved_count,
             (SELECT COUNT(*) FROM user_cart_items c WHERE c.user_id = u.id AND c.status = 'staged') as cart_count
      FROM users u
      ${whereStr}
      ORDER BY u.last_seen_at DESC NULLS LAST, u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const userList = await env.DB.prepare(usersQuery).bind(...params, limit, offset).all();

    return json(
      {
        ok: true,
        users: userList.results || [],
        total: totalCount,
        limit,
        offset
      },
      200,
      request,
      env
    );
  }

  // ---------------------------------------------------------------------------
  // 3. GET /api/admin/users/:id/details (Full 360-degree user inspection)
  // ---------------------------------------------------------------------------
  const userDetailsMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/details$/);
  if (userDetailsMatch && request.method === "GET") {
    const targetUserId = userDetailsMatch[1];
    const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first();
    if (!targetUser) return json({ ok: false, error: "User not found" }, 404, request, env);

    const devices = (await env.DB.prepare("SELECT * FROM user_devices WHERE user_id = ? ORDER BY last_active_at DESC").bind(targetUserId).all())?.results || [];
    const searches = (await env.DB.prepare("SELECT * FROM user_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").bind(targetUserId).all())?.results || [];
    const cart = (await env.DB.prepare("SELECT * FROM user_cart_items WHERE user_id = ? AND status = 'staged'").bind(targetUserId).all())?.results || [];
    const products = (await env.DB.prepare("SELECT * FROM saved_products WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 20").bind(targetUserId).all())?.results || [];
    const gear = (await env.DB.prepare("SELECT * FROM streamer_gear WHERE streamer_id = ?").bind(targetUserId).all())?.results || [];

    return json({
      ok: true,
      user: targetUser,
      devices,
      searches,
      cart,
      products,
      gear
    }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 4. POST /api/admin/users/:id/role
  // ---------------------------------------------------------------------------
  const roleMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
  if (roleMatch && request.method === "POST") {
    const targetUserId = roleMatch[1];
    const body = await request.json().catch(() => ({}));
    const newRole = body.role;

    if (!["user", "streamer", "admin"].includes(newRole)) {
      return json({ ok: false, error: "Invalid role. Allowed values: 'user', 'streamer', 'admin'." }, 400, request, env);
    }

    if (targetUserId === admin.id && newRole !== "admin") {
      return json({ ok: false, error: "Cannot revoke your own admin permissions." }, 400, request, env);
    }

    const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first();
    if (!targetUser) return json({ ok: false, error: "User not found." }, 404, request, env);

    const isStreamerVal = (newRole === "streamer" || body.isStreamer) ? 1 : (newRole === "user" ? 0 : targetUser.is_streamer || 0);

    await env.DB.prepare("UPDATE users SET role = ?, is_streamer = ? WHERE id = ?")
      .bind(newRole, isStreamerVal, targetUserId)
      .run();

    await audit(env, admin.id, "user.role_change", {
      targetType: "user",
      targetId: targetUserId,
      detail: { oldRole: targetUser.role, newRole, userEmail: targetUser.email }
    });

    return json({ ok: true, id: targetUserId, role: newRole, isStreamer: Boolean(isStreamerVal) }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 5. POST /api/admin/users/:id/plan
  // ---------------------------------------------------------------------------
  const planMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/plan$/);
  if (planMatch && request.method === "POST") {
    const targetUserId = planMatch[1];
    const body = await request.json().catch(() => ({}));
    const newPlan = body.plan;
    const quotaOverride = body.quotaOverride !== undefined ? (body.quotaOverride === null ? null : parseInt(body.quotaOverride, 10)) : undefined;

    if (newPlan && !["free", "pro"].includes(newPlan)) {
      return json({ ok: false, error: "Invalid plan. Allowed: 'free', 'pro'." }, 400, request, env);
    }

    const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first();
    if (!targetUser) return json({ ok: false, error: "User not found." }, 404, request, env);

    const planToSet = newPlan || targetUser.plan;
    const quotaToSet = quotaOverride !== undefined ? quotaOverride : targetUser.quota_override;

    await env.DB.prepare("UPDATE users SET plan = ?, quota_override = ? WHERE id = ?")
      .bind(planToSet, quotaToSet, targetUserId)
      .run();

    await audit(env, admin.id, "user.plan_change", {
      targetType: "user",
      targetId: targetUserId,
      detail: { oldPlan: targetUser.plan, newPlan: planToSet, quotaOverride: quotaToSet, userEmail: targetUser.email }
    });

    return json({ ok: true, id: targetUserId, plan: planToSet, quotaOverride: quotaToSet }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 6. POST /api/admin/users/:id/block
  // ---------------------------------------------------------------------------
  const blockMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/block$/);
  if (blockMatch && request.method === "POST") {
    const targetUserId = blockMatch[1];
    const body = await request.json().catch(() => ({}));
    const shouldBlock = Boolean(body.blocked);
    const reason = body.reason ? String(body.reason).trim() : null;

    if (targetUserId === admin.id && shouldBlock) {
      return json({ ok: false, error: "You cannot block your own admin account." }, 400, request, env);
    }

    const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first();
    if (!targetUser) return json({ ok: false, error: "User not found." }, 404, request, env);

    const blockedAt = shouldBlock ? new Date().toISOString() : null;
    const blockedReason = shouldBlock ? reason || "Suspended by administrator" : null;

    await env.DB.prepare("UPDATE users SET blocked_at = ?, blocked_reason = ? WHERE id = ?")
      .bind(blockedAt, blockedReason, targetUserId)
      .run();

    // Revoke active sessions in devices
    if (shouldBlock) {
      await env.DB.prepare("UPDATE user_devices SET status = 'revoked', is_online = 0 WHERE user_id = ?").bind(targetUserId).run();
    }

    await audit(env, admin.id, shouldBlock ? "user.block" : "user.unblock", {
      targetType: "user",
      targetId: targetUserId,
      detail: { reason: blockedReason, userEmail: targetUser.email }
    });

    return json({ ok: true, id: targetUserId, blocked: shouldBlock, blockedAt, blockedReason }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 7. GET /api/admin/devices (All system devices & presence)
  // ---------------------------------------------------------------------------
  if (path === "/api/admin/devices" && request.method === "GET") {
    const filter = url.searchParams.get("type") || "all";
    let query = `
      SELECT d.id, d.user_id, u.email as user_email, u.name as user_name,
             d.device_type, d.device_name, d.platform_os, d.ip_address, d.geo_country,
             d.is_online, d.status, d.last_active_at, d.created_at
      FROM user_devices d
      LEFT JOIN users u ON d.user_id = u.id
    `;
    const params = [];
    if (filter !== "all" && ["extension", "mobile", "web"].includes(filter)) {
      query += " WHERE d.device_type = ?";
      params.push(filter);
    }
    query += " ORDER BY d.last_active_at DESC LIMIT 100";

    const devices = await env.DB.prepare(query).bind(...params).all();
    return json({ ok: true, devices: devices.results || [] }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 8. POST /api/admin/devices/:id/revoke
  // ---------------------------------------------------------------------------
  const revokeDevMatch = path.match(/^\/api\/admin\/devices\/([^/]+)\/revoke$/);
  if (revokeDevMatch && request.method === "POST") {
    const devId = revokeDevMatch[1];
    await env.DB.prepare("UPDATE user_devices SET status = 'revoked', is_online = 0 WHERE id = ?").bind(devId).run();

    await audit(env, admin.id, "device.revoke", {
      targetType: "device",
      targetId: devId,
      detail: { revokedByAdmin: admin.email }
    });

    return json({ ok: true, revoked: true, id: devId }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 9. GET /api/admin/activity-stream (Live Search & Scan Feed)
  // ---------------------------------------------------------------------------
  if (path === "/api/admin/activity-stream" && request.method === "GET") {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "40", 10)));
    const query = `
      SELECT s.id, s.user_id, u.email as user_email, u.name as user_name,
             s.device_type, s.stream_platform, s.stream_channel_or_url,
             s.detected_query, s.matched_asin, s.product_title, s.confidence_score,
             s.source_frame_url, s.created_at
      FROM user_searches s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
      LIMIT ?
    `;

    const searches = await env.DB.prepare(query).bind(limit).all();
    return json({ ok: true, stream: searches.results || [] }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 10. GET /api/admin/streamers (Streamer Creator Network Overview)
  // ---------------------------------------------------------------------------
  if (path === "/api/admin/streamers" && request.method === "GET") {
    const streamersQuery = `
      SELECT u.id, u.email, u.name, u.avatar_url, u.affiliate_tag, u.streamer_verified,
             u.stream_channels, u.created_at, u.last_seen_at,
             (SELECT COUNT(*) FROM streamer_gear g WHERE g.streamer_id = u.id AND g.active = 1) as gear_count,
             (SELECT COUNT(*) FROM user_searches s WHERE s.stream_channel_or_url LIKE '%' || COALESCE(u.affiliate_tag, u.id) || '%') as audience_scans
      FROM users u
      WHERE u.role = 'streamer' OR u.is_streamer = 1
      ORDER BY gear_count DESC, u.last_seen_at DESC
      LIMIT 100
    `;

    const streamers = await env.DB.prepare(streamersQuery).all();
    return json({ ok: true, streamers: streamers.results || [] }, 200, request, env);
  }

  // ---------------------------------------------------------------------------
  // 11. GET /api/admin/audit-log
  // ---------------------------------------------------------------------------
  if (path === "/api/admin/audit-log" && request.method === "GET") {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

    const logsQuery = `
      SELECT a.id, a.actor_id, u.email as actor_email, u.name as actor_name,
             a.action, a.target_type, a.target_id, a.detail, a.created_at
      FROM audit_log a
      LEFT JOIN users u ON a.actor_id = u.id
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logs = await env.DB.prepare(logsQuery).bind(limit, offset).all();

    return json(
      {
        ok: true,
        logs: logs.results || [],
        limit,
        offset
      },
      200,
      request,
      env
    );
  }

  return json({ ok: false, error: "Admin endpoint not found" }, 404, request, env);
}
