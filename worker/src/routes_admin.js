/**
 * StreamSnap Platform — Admin & User Management Routes.
 *
 * All endpoints here require active admin credentials via `requireAdmin`.
 * Privilege elevation, role changes, plan overrides, and account blocks
 * are strictly audited in `audit_log`.
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

  // --- GET /api/admin/stats ------------------------------------------------
  if (path === "/api/admin/stats" && request.method === "GET") {
    const totalUsers = (await env.DB.prepare("SELECT COUNT(*) as count FROM users").first())?.count || 0;
    const proUsers = (await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE plan = 'pro'").first())?.count || 0;
    const adminUsers = (await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first())?.count || 0;
    const blockedUsers = (await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE blocked_at IS NOT NULL").first())?.count || 0;

    const todayIso = new Date().toISOString().slice(0, 10);
    const scansToday = (await env.DB.prepare("SELECT COUNT(*) as count FROM usage_events WHERE date(created_at) = date('now')").first())?.count || 0;
    const scansTotal = (await env.DB.prepare("SELECT COUNT(*) as count FROM usage_events").first())?.count || 0;
    const cachedScans = (await env.DB.prepare("SELECT COUNT(*) as count FROM usage_events WHERE cached = 1").first())?.count || 0;

    const recentActivity = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.role, u.plan, u.last_seen_at
       FROM users u
       ORDER BY u.last_seen_at DESC NULLS LAST, u.created_at DESC
       LIMIT 5`
    ).all();

    return json(
      {
        ok: true,
        stats: {
          totalUsers,
          proUsers,
          adminUsers,
          blockedUsers,
          scansToday,
          scansTotal,
          cachedScans,
          cacheHitRate: scansTotal > 0 ? Math.round((cachedScans / scansTotal) * 100) : 0
        },
        recentUsers: recentActivity.results || []
      },
      200,
      request,
      env
    );
  }

  // --- GET /api/admin/users ------------------------------------------------
  if (path === "/api/admin/users" && request.method === "GET") {
    const search = url.searchParams.get("search")?.trim() || "";
    const role = url.searchParams.get("role") || "all";
    const plan = url.searchParams.get("plan") || "all";
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push("(email LIKE ? OR name LIKE ? OR id LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (role !== "all" && ["user", "admin"].includes(role)) {
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
             u.affiliate_tag, u.blocked_at, u.blocked_reason, u.created_at, u.last_seen_at,
             (SELECT COUNT(*) FROM usage_events e WHERE e.user_id = u.id) as scan_count
      FROM users u
      ${whereStr}
      ORDER BY u.created_at DESC
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

  // --- POST /api/admin/users/:id/role --------------------------------------
  const roleMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
  if (roleMatch && request.method === "POST") {
    const targetUserId = roleMatch[1];
    const body = await request.json().catch(() => ({}));
    const newRole = body.role;

    if (!["user", "admin"].includes(newRole)) {
      return json({ ok: false, error: "Invalid role. Allowed values: 'user', 'admin'." }, 400, request, env);
    }

    if (targetUserId === admin.id && newRole !== "admin") {
      return json({ ok: false, error: "Cannot revoke your own admin permissions." }, 400, request, env);
    }

    const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first();
    if (!targetUser) return json({ ok: false, error: "User not found." }, 404, request, env);

    await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(newRole, targetUserId).run();

    await audit(env, admin.id, "user.role_change", {
      targetType: "user",
      targetId: targetUserId,
      detail: { oldRole: targetUser.role, newRole, userEmail: targetUser.email }
    });

    return json({ ok: true, id: targetUserId, role: newRole }, 200, request, env);
  }

  // --- POST /api/admin/users/:id/plan --------------------------------------
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

  // --- POST /api/admin/users/:id/block -------------------------------------
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

    await audit(env, admin.id, shouldBlock ? "user.block" : "user.unblock", {
      targetType: "user",
      targetId: targetUserId,
      detail: { reason: blockedReason, userEmail: targetUser.email }
    });

    return json({ ok: true, id: targetUserId, blocked: shouldBlock, blockedAt, blockedReason }, 200, request, env);
  }

  // --- GET /api/admin/audit-log --------------------------------------------
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
