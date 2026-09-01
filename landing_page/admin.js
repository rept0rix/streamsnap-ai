/**
 * StreamSnap AI — Admin Portal Application Logic
 */

(function () {
  "use strict";

  // State
  let currentUser = null;
  let isDemoMode = false;
  let activeTab = "users";
  let usersData = [];
  let auditLogsData = [];
  let statsData = {};

  // Mock demo dataset for offline / pre-login testing
  const DEMO_USERS = [
    {
      id: "usr_admin_master",
      email: "admin@streamsnap.online",
      name: "StreamSnap SuperAdmin",
      avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces",
      role: "admin",
      plan: "pro",
      quota_override: 5000,
      affiliate_tag: "streamsnap-20",
      blocked_at: null,
      created_at: "2026-08-01T10:00:00Z",
      last_seen_at: "2026-08-31T12:45:00Z",
      scan_count: 1420
    },
    {
      id: "usr_alex_creator",
      email: "alex@creatorstream.io",
      name: "Alex River",
      avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces",
      role: "user",
      plan: "pro",
      quota_override: 1000,
      affiliate_tag: "alexlive-20",
      blocked_at: null,
      created_at: "2026-08-10T14:20:00Z",
      last_seen_at: "2026-08-31T11:15:00Z",
      scan_count: 384
    },
    {
      id: "usr_sarah_tech",
      email: "sarah.m@techgear.com",
      name: "Sarah Miller",
      avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces",
      role: "user",
      plan: "free",
      quota_override: null,
      affiliate_tag: null,
      blocked_at: null,
      created_at: "2026-08-15T09:12:00Z",
      last_seen_at: "2026-08-30T18:30:00Z",
      scan_count: 52
    },
    {
      id: "usr_spam_bot",
      email: "bot892@spammer.net",
      name: "Suspicious Activity",
      avatar_url: null,
      role: "user",
      plan: "free",
      quota_override: null,
      affiliate_tag: null,
      blocked_at: "2026-08-28T16:00:00Z",
      blocked_reason: "High rate-limit anomalies detected",
      created_at: "2026-08-28T15:30:00Z",
      last_seen_at: "2026-08-28T16:00:00Z",
      scan_count: 400
    }
  ];

  const DEMO_AUDIT_LOGS = [
    {
      id: 104,
      actor_email: "admin@streamsnap.online",
      actor_name: "StreamSnap SuperAdmin",
      action: "user.role_change",
      target_type: "user",
      target_id: "usr_alex_creator",
      detail: JSON.stringify({ oldRole: "user", newRole: "admin" }),
      created_at: "2026-08-31T11:20:00Z"
    },
    {
      id: 103,
      actor_email: "admin@streamsnap.online",
      actor_name: "StreamSnap SuperAdmin",
      action: "user.block",
      target_type: "user",
      target_id: "usr_spam_bot",
      detail: JSON.stringify({ reason: "High rate-limit anomalies detected" }),
      created_at: "2026-08-28T16:00:00Z"
    },
    {
      id: 102,
      actor_email: "admin@streamsnap.online",
      actor_name: "StreamSnap SuperAdmin",
      action: "user.plan_change",
      target_type: "user",
      target_id: "usr_alex_creator",
      detail: JSON.stringify({ oldPlan: "free", newPlan: "pro", quotaOverride: 1000 }),
      created_at: "2026-08-20T10:15:00Z"
    }
  ];

  // DOM elements
  const el = (id) => document.getElementById(id);

  // Initialize
  async function init() {
    setupTabNavigation();
    setupEventListeners();
    await checkAuth();
  }

  async function checkAuth() {
    // Determine worker base (same as admin.html inline script)
    const host = location.hostname;
    const workerBase = (host === 'streamsnap.online' || host === 'www.streamsnap.online')
      ? ''
      : 'https://streamsnap-lens.na0ryank0.workers.dev';

    try {
      const res = await fetch(`${workerBase}/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.signedIn && data.user.role === 'admin') {
          currentUser = data.user;
          showMainContent(false);
          renderAdminProfile(currentUser);
          await loadLiveStats();
          await loadLiveUsers();
          await loadLiveAudit();
          return;
        }
        // Signed in but not admin
        if (data.ok && data.signedIn) {
          showLoginWall('Your account does not have admin permissions.');
          return;
        }
      }
    } catch (e) {
      console.log('Auth check failed — worker may be offline or credentials missing.');
    }

    // No live worker with Google credentials: offer demo mode
    showDemoMode();
  }

  function showLoginWall(errorMessage) {
    const wall = el('login-wall');
    if (wall) { wall.style.display = 'flex'; }
    if (errorMessage) {
      const errEl = el('login-wall-error');
      if (errEl) { errEl.textContent = errorMessage; errEl.style.display = 'block'; }
    }
  }

  function showMainContent(isDemo) {
    const main = el('admin-main-content');
    if (main) main.style.display = '';
    const pill = el('admin-user-pill');
    if (pill) pill.style.display = '';
    const signoutBtn = el('admin-signout-btn');
    if (signoutBtn && !isDemo) signoutBtn.style.display = '';
    const wall = el('login-wall');
    if (wall) wall.style.display = 'none';
  }

  function showDemoMode() {
    isDemoMode = true;
    currentUser = DEMO_USERS[0];
    usersData = [...DEMO_USERS];
    auditLogsData = [...DEMO_AUDIT_LOGS];
    showMainContent(true);
    renderAdminProfile(currentUser);
    renderDemoNotice();
    renderStats({
      totalUsers: usersData.length,
      proUsers: usersData.filter((u) => u.plan === 'pro').length,
      adminUsers: usersData.filter((u) => u.role === 'admin').length,
      blockedUsers: usersData.filter((u) => u.blocked_at).length,
      scansToday: 842,
      scansTotal: 2256,
      cachedScans: 1489,
      cacheHitRate: 66
    });
    renderUsersTable(usersData);
    renderAuditTable(auditLogsData);
  }

  function renderAdminProfile(user) {
    el('admin-name').textContent = user.name || user.email;
    if (user.avatar_url || user.avatarUrl) {
      el('admin-avatar').src = user.avatar_url || user.avatarUrl;
    }
  }

  function renderDemoNotice() {
    const banner = el('demo-banner');
    if (banner) banner.style.display = 'flex';
  }

  function setupTabNavigation() {
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach((p) => (p.style.display = "none"));

        tab.classList.add("active");
        const target = tab.dataset.tab;
        activeTab = target;
        const pane = el(`pane-${target}`);
        if (pane) pane.style.display = "block";
      });
    });
  }

  function setupEventListeners() {
    const searchInput = el("user-search");
    const roleFilter = el("filter-role");
    const planFilter = el("filter-plan");
    const statusFilter = el("filter-status");

    const applyFilters = () => {
      const q = (searchInput?.value || "").toLowerCase().trim();
      const r = roleFilter?.value || "all";
      const p = planFilter?.value || "all";
      const s = statusFilter?.value || "all";

      if (isDemoMode) {
        let filtered = usersData.filter((u) => {
          const matchQ = !q || u.email.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q)) || u.id.includes(q);
          const matchR = r === "all" || u.role === r;
          const matchP = p === "all" || u.plan === p;
          const matchS = s === "all" || (s === "active" ? !u.blocked_at : Boolean(u.blocked_at));
          return matchQ && matchR && matchP && matchS;
        });
        renderUsersTable(filtered);
      } else {
        loadLiveUsers();
      }
    };

    searchInput?.addEventListener("input", debounce(applyFilters, 300));
    roleFilter?.addEventListener("change", applyFilters);
    planFilter?.addEventListener("change", applyFilters);
    statusFilter?.addEventListener("change", applyFilters);

    // Modal Close
    el("modal-cancel")?.addEventListener("click", closeModal);
  }

  // Render Stats
  function renderStats(s) {
    el("stat-total-users").textContent = (s.totalUsers || 0).toLocaleString();
    el("stat-pro-users").textContent = (s.proUsers || 0).toLocaleString();
    el("stat-scans-today").textContent = (s.scansToday || 0).toLocaleString();
    el("stat-cache-rate").textContent = `${s.cacheHitRate || 0}%`;
  }

  // Render Users Table
  function renderUsersTable(users) {
    const tbody = el("users-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px; color: var(--text-dim);">No users found matching current filters.</td></tr>`;
      return;
    }

    users.forEach((u) => {
      const tr = document.createElement("tr");

      const avatarSrc = u.avatar_url || "https://ui-avatars.com/api/?background=1E293B&color=FF9900&name=" + encodeURIComponent(u.name || u.email);
      const isBlocked = Boolean(u.blocked_at);
      const lastSeen = u.last_seen_at ? formatRelativeTime(u.last_seen_at) : "Never";

      tr.innerHTML = `
        <td>
          <div class="user-cell">
            <img src="${avatarSrc}" class="user-avatar-sm" alt="" />
            <div class="user-meta">
              <span class="user-name">${escapeHtml(u.name || "Unnamed User")}</span>
              <span class="user-email">${escapeHtml(u.email)}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="badge badge-${u.role}">${u.role.toUpperCase()}</span>
        </td>
        <td>
          <span class="badge badge-${u.plan}">${u.plan.toUpperCase()}</span>
          ${u.quota_override ? `<span style="font-size:11px;color:var(--snap-gold);margin-left:4px;">(${u.quota_override}/mo)</span>` : ""}
        </td>
        <td>
          <span style="font-weight:700;">${(u.scan_count || 0).toLocaleString()}</span>
        </td>
        <td>
          <span class="badge badge-${isBlocked ? "blocked" : "active"}">${isBlocked ? "BLOCKED" : "ACTIVE"}</span>
        </td>
        <td style="color:var(--text-muted);font-size:12px;">${lastSeen}</td>
        <td>
          <div class="action-btn-group">
            <button class="btn-action gold" onclick="window.toggleUserRole('${u.id}')" title="Toggle Admin/User">
              ${u.role === "admin" ? "Demote" : "Make Admin"}
            </button>
            <button class="btn-action" onclick="window.toggleUserPlan('${u.id}')" title="Toggle Pro/Free">
              ${u.plan === "pro" ? "Downgrade" : "Upgrade Pro"}
            </button>
            <button class="btn-action danger" onclick="window.toggleUserBlock('${u.id}')">
              ${isBlocked ? "Unblock" : "Block"}
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  // Render Audit Table
  function renderAuditTable(logs) {
    const tbody = el("audit-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    logs.forEach((log) => {
      const tr = document.createElement("tr");
      let detailsText = log.detail;
      try {
        const parsed = JSON.parse(log.detail);
        detailsText = Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(" | ");
      } catch (e) {}

      tr.innerHTML = `
        <td style="font-family:monospace;font-size:12px;">#${log.id}</td>
        <td>
          <div style="font-weight:600;">${escapeHtml(log.actor_name || log.actor_email || log.actor_id)}</div>
          <div style="font-size:11px;color:var(--text-dim);">${escapeHtml(log.actor_email || "")}</div>
        </td>
        <td><span class="badge badge-admin">${escapeHtml(log.action)}</span></td>
        <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(detailsText || "-")}</td>
        <td style="font-size:12px;color:var(--text-dim);">${formatRelativeTime(log.created_at)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Actions
  window.toggleUserRole = async function (userId) {
    const user = usersData.find((u) => u.id === userId);
    if (!user) return;
    const newRole = user.role === "admin" ? "user" : "admin";

    if (isDemoMode) {
      user.role = newRole;
      auditLogsData.unshift({
        id: Date.now(),
        actor_email: currentUser.email,
        actor_name: currentUser.name,
        action: "user.role_change",
        target_type: "user",
        target_id: userId,
        detail: JSON.stringify({ oldRole: user.role === "admin" ? "user" : "admin", newRole }),
        created_at: new Date().toISOString()
      });
      showToast(`User role updated to ${newRole.toUpperCase()}!`);
      renderUsersTable(usersData);
      renderAuditTable(auditLogsData);
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`User role successfully changed to ${newRole.toUpperCase()}!`);
        await loadLiveUsers();
        await loadLiveAudit();
      } else {
        showToast(data.error || "Failed to update role", "error");
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  window.toggleUserPlan = async function (userId) {
    const user = usersData.find((u) => u.id === userId);
    if (!user) return;
    const newPlan = user.plan === "pro" ? "free" : "pro";

    if (isDemoMode) {
      user.plan = newPlan;
      user.quota_override = newPlan === "pro" ? 1000 : null;
      auditLogsData.unshift({
        id: Date.now(),
        actor_email: currentUser.email,
        actor_name: currentUser.name,
        action: "user.plan_change",
        target_type: "user",
        target_id: userId,
        detail: JSON.stringify({ newPlan }),
        created_at: new Date().toISOString()
      });
      showToast(`Plan updated to ${newPlan.toUpperCase()}!`);
      renderUsersTable(usersData);
      renderAuditTable(auditLogsData);
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan, quotaOverride: newPlan === "pro" ? 1000 : null })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`User plan changed to ${newPlan.toUpperCase()}!`);
        await loadLiveUsers();
        await loadLiveAudit();
      } else {
        showToast(data.error || "Failed to update plan", "error");
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  window.toggleUserBlock = async function (userId) {
    const user = usersData.find((u) => u.id === userId);
    if (!user) return;
    const shouldBlock = !user.blocked_at;

    if (isDemoMode) {
      user.blocked_at = shouldBlock ? new Date().toISOString() : null;
      auditLogsData.unshift({
        id: Date.now(),
        actor_email: currentUser.email,
        actor_name: currentUser.name,
        action: shouldBlock ? "user.block" : "user.unblock",
        target_type: "user",
        target_id: userId,
        detail: JSON.stringify({ blocked: shouldBlock }),
        created_at: new Date().toISOString()
      });
      showToast(`User account ${shouldBlock ? "Blocked" : "Unblocked"}!`);
      renderUsersTable(usersData);
      renderAuditTable(auditLogsData);
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: shouldBlock, reason: shouldBlock ? "Admin manual suspension" : null })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`User account ${shouldBlock ? "Suspended" : "Restored"}!`);
        await loadLiveUsers();
        await loadLiveAudit();
      } else {
        showToast(data.error || "Failed to change block status", "error");
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // Helpers
  function closeModal() {
    el("admin-modal")?.classList.remove("open");
  }

  function showToast(msg, type = "success") {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.style.borderColor = type === "error" ? "var(--snap-rose)" : "var(--snap-gold)";
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function debounce(fn, delay) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function formatRelativeTime(isoStr) {
    const delta = Math.round((new Date() - new Date(isoStr)) / 1000);
    if (delta < 60) return "just now";
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
    return `${Math.floor(delta / 86400)}d ago`;
  }

  // Start app
  document.addEventListener("DOMContentLoaded", init);
})();
