/**
 * StreamSnap AI — SuperAdmin Cockpit Application Logic
 *
 * Full multi-device visibility, user & streamer management, live search feed,
 * and device connection controls.
 */

(function () {
  "use strict";

  // State
  let currentUser = null;
  let isDemoMode = false;
  let activeTab = "users";
  let usersData = [];
  let devicesData = [];
  let activityData = [];
  let streamersData = [];
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
      is_streamer: 0,
      online_device_count: 2,
      scan_count: 1420,
      cart_count: 5,
      blocked_at: null,
      created_at: "2026-08-01T10:00:00Z",
      last_seen_at: new Date().toISOString()
    },
    {
      id: "usr_alex_creator",
      email: "alex@creatorstream.io",
      name: "Alex River (Twitch & Kick Streamer)",
      avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces",
      role: "streamer",
      plan: "pro",
      quota_override: 2000,
      affiliate_tag: "alexlive-20",
      is_streamer: 1,
      streamer_verified: 1,
      stream_channels: JSON.stringify({ twitch: "alexriverlive", youtube: "@AlexRiver", kick: "alexstream" }),
      online_device_count: 1,
      scan_count: 584,
      cart_count: 3,
      blocked_at: null,
      created_at: "2026-08-10T14:20:00Z",
      last_seen_at: new Date(Date.now() - 1000 * 60 * 3).toISOString()
    },
    {
      id: "usr_sarah_tech",
      email: "sarah.m@techgear.com",
      name: "Sarah Miller (YouTube Creator)",
      avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces",
      role: "streamer",
      plan: "pro",
      quota_override: 1000,
      affiliate_tag: "sarahgeartv-20",
      is_streamer: 1,
      streamer_verified: 1,
      stream_channels: JSON.stringify({ youtube: "@SarahTechGear", tiktok: "@sarah.tech" }),
      online_device_count: 2,
      scan_count: 312,
      cart_count: 7,
      blocked_at: null,
      created_at: "2026-08-15T09:12:00Z",
      last_seen_at: new Date(Date.now() - 1000 * 60 * 8).toISOString()
    },
    {
      id: "usr_david_shopper",
      email: "david.k@gmail.com",
      name: "David Kim",
      avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces",
      role: "user",
      plan: "free",
      quota_override: null,
      affiliate_tag: null,
      is_streamer: 0,
      online_device_count: 1,
      scan_count: 42,
      cart_count: 2,
      blocked_at: null,
      created_at: "2026-08-20T11:05:00Z",
      last_seen_at: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    },
    {
      id: "usr_suspicious_bot",
      email: "anomaly842@proxyhub.net",
      name: "Automated Scraper Node",
      avatar_url: null,
      role: "user",
      plan: "free",
      quota_override: null,
      affiliate_tag: null,
      is_streamer: 0,
      online_device_count: 0,
      scan_count: 620,
      cart_count: 0,
      blocked_at: "2026-08-28T16:00:00Z",
      blocked_reason: "High rate-limit anomaly detected",
      created_at: "2026-08-28T15:30:00Z",
      last_seen_at: "2026-08-28T16:00:00Z"
    }
  ];

  const DEMO_DEVICES = [
    {
      id: "dev_ext_admin",
      user_id: "usr_admin_master",
      user_email: "admin@streamsnap.online",
      user_name: "StreamSnap SuperAdmin",
      device_type: "extension",
      device_name: "Chrome Extension v1.6.0 (Mac OS X)",
      platform_os: "macOS",
      ip_address: "185.12.44.91",
      geo_country: "US",
      is_online: 1,
      status: "active",
      last_active_at: new Date().toISOString()
    },
    {
      id: "dev_mob_alex",
      user_id: "usr_alex_creator",
      user_email: "alex@creatorstream.io",
      user_name: "Alex River",
      device_type: "mobile",
      device_name: "iPhone 15 Pro (iOS 18.2)",
      platform_os: "iOS",
      ip_address: "74.125.210.12",
      geo_country: "US",
      is_online: 1,
      status: "active",
      last_active_at: new Date(Date.now() - 1000 * 60 * 2).toISOString()
    },
    {
      id: "dev_ext_sarah",
      user_id: "usr_sarah_tech",
      user_email: "sarah.m@techgear.com",
      user_name: "Sarah Miller",
      device_type: "extension",
      device_name: "Chrome Extension v1.6.0 (Windows 11)",
      platform_os: "Windows",
      ip_address: "82.102.23.11",
      geo_country: "UK",
      is_online: 1,
      status: "active",
      last_active_at: new Date(Date.now() - 1000 * 60 * 5).toISOString()
    },
    {
      id: "dev_mob_sarah",
      user_id: "usr_sarah_tech",
      user_email: "sarah.m@techgear.com",
      user_name: "Sarah Miller",
      device_type: "mobile",
      device_name: "Samsung Galaxy S24 (Android 14)",
      platform_os: "Android",
      ip_address: "82.102.23.11",
      geo_country: "UK",
      is_online: 1,
      status: "active",
      last_active_at: new Date(Date.now() - 1000 * 60 * 6).toISOString()
    },
    {
      id: "dev_web_david",
      user_id: "usr_david_shopper",
      user_email: "david.k@gmail.com",
      user_name: "David Kim",
      device_type: "web",
      device_name: "Chrome 128 (MacBook Air)",
      platform_os: "macOS",
      ip_address: "216.58.214.14",
      geo_country: "CA",
      is_online: 1,
      status: "active",
      last_active_at: new Date(Date.now() - 1000 * 60 * 14).toISOString()
    }
  ];

  const DEMO_ACTIVITIES = [
    {
      id: "srch_101",
      user_email: "david.k@gmail.com",
      user_name: "David Kim",
      device_type: "extension",
      stream_platform: "twitch",
      stream_channel_or_url: "twitch.tv/alexriverlive",
      detected_query: "Shure SM7B Vocal Dynamic Microphone",
      matched_asin: "B0002E4Z8M",
      product_title: "Shure SM7B Cardioid Dynamic Microphone",
      confidence_score: 96,
      created_at: new Date(Date.now() - 1000 * 45).toISOString()
    },
    {
      id: "srch_102",
      user_email: "alex@creatorstream.io",
      user_name: "Alex River",
      device_type: "mobile",
      stream_platform: "camera",
      stream_channel_or_url: "Live Camera Snap",
      detected_query: "Elgato Stream Deck MK.2",
      matched_asin: "B09738CV2G",
      product_title: "Elgato Stream Deck MK.2 – 15 Macro Keys",
      confidence_score: 94,
      created_at: new Date(Date.now() - 1000 * 120).toISOString()
    },
    {
      id: "srch_103",
      user_email: "sarah.m@techgear.com",
      user_name: "Sarah Miller",
      device_type: "extension",
      stream_platform: "youtube",
      stream_channel_or_url: "youtube.com/live/KaiCenat",
      detected_query: "Nike Tech Fleece Full-Zip Windrunner",
      matched_asin: "B08T9NQK75",
      product_title: "Nike Men's Sportswear Tech Fleece Hoodie",
      confidence_score: 91,
      created_at: new Date(Date.now() - 1000 * 300).toISOString()
    },
    {
      id: "srch_104",
      user_email: "david.k@gmail.com",
      user_name: "David Kim",
      device_type: "mobile",
      stream_platform: "tiktok",
      stream_channel_or_url: "tiktok.com/@creator/live",
      detected_query: "Sony WH-1000XM5 Wireless Headphones",
      matched_asin: "B09XS7JWHH",
      product_title: "Sony WH-1000XM5 Noise Canceling Headphones",
      confidence_score: 98,
      created_at: new Date(Date.now() - 1000 * 480).toISOString()
    }
  ];

  const DEMO_STREAMERS = [
    {
      id: "usr_alex_creator",
      email: "alex@creatorstream.io",
      name: "Alex River",
      affiliate_tag: "alexlive-20",
      streamer_verified: 1,
      stream_channels: JSON.stringify({ twitch: "alexriverlive", youtube: "@AlexRiver", kick: "alexstream" }),
      gear_count: 6,
      audience_scans: 842,
      last_seen_at: new Date().toISOString()
    },
    {
      id: "usr_sarah_tech",
      email: "sarah.m@techgear.com",
      name: "Sarah Miller",
      affiliate_tag: "sarahgeartv-20",
      streamer_verified: 1,
      stream_channels: JSON.stringify({ youtube: "@SarahTechGear", tiktok: "@sarah.tech" }),
      gear_count: 9,
      audience_scans: 620,
      last_seen_at: new Date().toISOString()
    }
  ];

  const DEMO_AUDIT_LOGS = [
    {
      id: 105,
      actor_email: "admin@streamsnap.online",
      actor_name: "StreamSnap SuperAdmin",
      action: "user.role_change",
      target_type: "user",
      target_id: "usr_alex_creator",
      detail: JSON.stringify({ oldRole: "user", newRole: "streamer", isStreamer: true }),
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    },
    {
      id: 104,
      actor_email: "admin@streamsnap.online",
      actor_name: "StreamSnap SuperAdmin",
      action: "device.revoke",
      target_type: "device",
      target_id: "dev_old_session",
      detail: JSON.stringify({ reason: "Manual device revocation" }),
      created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString()
    },
    {
      id: 103,
      actor_email: "admin@streamsnap.online",
      actor_name: "StreamSnap SuperAdmin",
      action: "user.block",
      target_type: "user",
      target_id: "usr_suspicious_bot",
      detail: JSON.stringify({ reason: "High rate-limit anomaly detected" }),
      created_at: "2026-08-28T16:00:00Z"
    }
  ];

  // DOM Elements
  const adminMainContent = document.getElementById("admin-main-content");
  const loginWall = document.getElementById("login-wall");
  const demoBanner = document.getElementById("demo-banner");
  const adminUserPill = document.getElementById("admin-user-pill");
  const adminSignoutBtn = document.getElementById("admin-signout-btn");
  const adminAvatar = document.getElementById("admin-avatar");
  const adminName = document.getElementById("admin-name");

  // Tab elements
  const navTabs = document.querySelectorAll(".nav-tab");
  const tabPanes = document.querySelectorAll(".tab-pane");

  // Filter elements
  const userSearch = document.getElementById("user-search");
  const filterRole = document.getElementById("filter-role");
  const filterPlan = document.getElementById("filter-plan");
  const filterStatus = document.getElementById("filter-status");

  // Modals state
  let modalTargetUserId = null;

  // ---------------------------------------------------------------------------
  // API Fetch Utility
  // ---------------------------------------------------------------------------
  async function apiCall(endpoint, options = {}) {
    const base = getWorkerBase();
    const headers = { "Content-Type": "application/json", ...options.headers };
    try {
      const res = await fetch(`${base}${endpoint}`, {
        credentials: "include",
        ...options,
        headers
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, unauthorized: true, error: "Access Denied" };
      }
      return await res.json();
    } catch (err) {
      return { ok: false, networkError: true, error: err.message };
    }
  }

  // ---------------------------------------------------------------------------
  // Bootstrap & Auth Check
  // ---------------------------------------------------------------------------
  async function init() {
    setupTabNavigation();
    setupFilters();

    const meRes = await apiCall("/auth/me");
    if (meRes.ok && meRes.signedIn) {
      if (meRes.user.role === "admin") {
        currentUser = meRes.user;
        isDemoMode = false;
        showAdminUI();
        loadAllData();
        return;
      } else {
        showLoginWall("Your account does not have Administrator permissions.");
        return;
      }
    }

    // If server has no auth configured or running locally, enable Demo Mode
    isDemoMode = true;
    demoBanner.style.display = "flex";
    currentUser = DEMO_USERS[0];
    showAdminUI();
    loadDemoData();
  }

  function showAdminUI() {
    loginWall.style.display = "none";
    adminMainContent.style.display = "block";
    adminUserPill.style.display = "flex";
    adminSignoutBtn.style.display = "inline-block";

    adminName.textContent = currentUser.name || currentUser.email;
    if (currentUser.avatar_url || currentUser.avatarUrl) {
      adminAvatar.src = currentUser.avatar_url || currentUser.avatarUrl;
    }
  }

  function showLoginWall(errorMessage) {
    adminMainContent.style.display = "none";
    loginWall.style.display = "flex";
    if (errorMessage) {
      const errEl = document.getElementById("login-wall-error");
      errEl.textContent = errorMessage;
      errEl.style.display = "block";
    }
  }

  // ---------------------------------------------------------------------------
  // Tabs Navigation
  // ---------------------------------------------------------------------------
  function setupTabNavigation() {
    navTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        navTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        const tabKey = tab.dataset.tab;
        activeTab = tabKey;

        tabPanes.forEach((p) => (p.style.display = "none"));
        const targetPane = document.getElementById(`pane-${tabKey}`);
        if (targetPane) targetPane.style.display = "block";

        if (tabKey === "devices") loadDevices();
        if (tabKey === "activity") loadActivityFeed();
        if (tabKey === "streamers") loadStreamers();
        if (tabKey === "audit") loadAuditLogs();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  async function loadAllData() {
    await Promise.all([
      loadStats(),
      loadUsers(),
      loadDevices(),
      loadActivityFeed(),
      loadStreamers(),
      loadAuditLogs()
    ]);
  }

  function loadDemoData() {
    statsData = {
      totalUsers: DEMO_USERS.length,
      proUsers: 3,
      streamerUsers: 2,
      adminUsers: 1,
      scansToday: 184,
      totalSavedProducts: 34,
      totalCartItems: 17,
      cacheHitRate: 64,
      presence: {
        totalOnline: 4,
        extension: 2,
        mobile: 2,
        web: 1
      }
    };
    renderStats(statsData);
    usersData = DEMO_USERS;
    renderUsersTable(usersData);
    devicesData = DEMO_DEVICES;
    renderDevicesTable(devicesData);
    activityData = DEMO_ACTIVITIES;
    renderActivityTable(activityData);
    streamersData = DEMO_STREAMERS;
    renderStreamersTable(streamersData);
    auditLogsData = DEMO_AUDIT_LOGS;
    renderAuditTable(auditLogsData);
  }

  async function loadStats() {
    if (isDemoMode) return;
    const res = await apiCall("/api/admin/stats");
    if (res.ok) {
      statsData = res.stats;
      renderStats(statsData);
    }
  }

  function renderStats(stats) {
    document.getElementById("stat-total-users").textContent = stats.totalUsers || 0;
    
    const onlineCount = stats.presence?.totalOnline || 0;
    document.getElementById("stat-online-devices-count").textContent = onlineCount;
    document.getElementById("stat-device-breakdown").textContent = 
      `Ext: ${stats.presence?.extension || 0} | Mobile: ${stats.presence?.mobile || 0} | Web: ${stats.presence?.web || 0}`;

    document.getElementById("stat-streamer-users").textContent = stats.streamerUsers || 0;
    document.getElementById("stat-scans-today").textContent = stats.scansToday || 0;
    document.getElementById("stat-cart-items").textContent = stats.totalCartItems || 0;
    document.getElementById("stat-cache-rate").textContent = `${stats.cacheHitRate || 0}%`;
  }

  async function loadUsers() {
    if (isDemoMode) return;
    const res = await apiCall("/api/admin/users");
    if (res.ok) {
      usersData = res.users;
      renderUsersTable(usersData);
    }
  }

  async function loadDevices() {
    if (isDemoMode) return;
    const res = await apiCall("/api/admin/devices");
    if (res.ok) {
      devicesData = res.devices;
      renderDevicesTable(devicesData);
    }
  }

  async function loadActivityFeed() {
    if (isDemoMode) return;
    const res = await apiCall("/api/admin/activity-stream");
    if (res.ok) {
      activityData = res.stream;
      renderActivityTable(activityData);
    }
  }

  async function loadStreamers() {
    if (isDemoMode) return;
    const res = await apiCall("/api/admin/streamers");
    if (res.ok) {
      streamersData = res.streamers;
      renderStreamersTable(streamersData);
    }
  }

  async function loadAuditLogs() {
    if (isDemoMode) return;
    const res = await apiCall("/api/admin/audit-log");
    if (res.ok) {
      auditLogsData = res.logs;
      renderAuditTable(auditLogsData);
    }
  }

  // ---------------------------------------------------------------------------
  // Render: Tab 1 Users Table
  // ---------------------------------------------------------------------------
  function renderUsersTable(users) {
    const tbody = document.getElementById("users-tbody");
    tbody.innerHTML = "";

    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--text-dim);">No users found matching query.</td></tr>`;
      return;
    }

    users.forEach((u) => {
      const tr = document.createElement("tr");

      const isBlocked = Boolean(u.blocked_at);
      const isStreamer = u.role === "streamer" || u.is_streamer === 1;
      const onlineDevices = u.online_device_count || 0;

      // Role badge
      let roleBadge = `<span class="badge badge-user">Shopper</span>`;
      if (u.role === "admin") {
        roleBadge = `<span class="badge badge-admin">SuperAdmin</span>`;
      } else if (isStreamer) {
        roleBadge = `<span class="badge badge-streamer">🎙️ Streamer</span>`;
      }

      // Status badge
      const statusBadge = isBlocked
        ? `<span class="badge badge-blocked">Suspended</span>`
        : `<span class="badge badge-active">Active</span>`;

      // Plan badge
      const planBadge = u.plan === "pro"
        ? `<span class="badge badge-pro">PRO ⚡</span>`
        : `<span class="badge badge-free">Free</span>`;

      // Online status indicator
      const onlineIndicator = onlineDevices > 0
        ? `<span class="device-pill online"><span class="status-dot-online"></span> ${onlineDevices} Online</span>`
        : `<span class="device-pill"><span class="status-dot-offline"></span> 0 Online</span>`;

      const avatarSrc = u.avatar_url || `https://ui-avatars.com/api/?background=1E293B&color=94A3B8&name=${encodeURIComponent(u.name || u.email)}`;
      const lastActiveFormatted = u.last_seen_at ? timeAgo(new Date(u.last_seen_at)) : "Never";

      tr.innerHTML = `
        <td>
          <div class="user-cell">
            <img src="${escapeHtml(avatarSrc)}" class="user-avatar-sm" alt="" />
            <div class="user-meta">
              <div class="user-name">${escapeHtml(u.name || "Unnamed User")}</div>
              <div class="user-email">${escapeHtml(u.email)}</div>
              ${u.affiliate_tag ? `<div style="font-size:11px; color:var(--snap-gold); font-family:monospace;">Tag: ${escapeHtml(u.affiliate_tag)}</div>` : ""}
            </div>
          </div>
        </td>
        <td>${roleBadge}</td>
        <td>${planBadge}</td>
        <td>${onlineIndicator}</td>
        <td>
          <div style="font-size:12px;"><strong>${u.scan_count || 0}</strong> Scans</div>
          <div style="font-size:11px; color:var(--text-dim);">${u.cart_count || 0} Cart Items</div>
        </td>
        <td>${statusBadge}</td>
        <td style="color:var(--text-muted); font-size:12px;">${lastActiveFormatted}</td>
        <td>
          <div class="action-btn-group">
            <button class="btn-action gold" onclick="window.inspectUser('${u.id}')" title="Inspect full profile & connected devices">Inspect 360°</button>
            <button class="btn-action" onclick="window.openRoleModal('${u.id}', '${u.role}', ${isStreamer ? 1 : 0})">Role</button>
            <button class="btn-action" onclick="window.openPlanModal('${u.id}', '${u.plan}', '${u.quota_override || ""}')">Plan</button>
            <button class="btn-action ${isBlocked ? "gold" : "danger"}" onclick="window.openBlockModal('${u.id}', ${isBlocked})">
              ${isBlocked ? "Unblock" : "Block"}
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------------------------
  // Render: Tab 2 Live Devices Table
  // ---------------------------------------------------------------------------
  function renderDevicesTable(devices) {
    const tbody = document.getElementById("devices-tbody");
    tbody.innerHTML = "";

    if (!devices || devices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-dim);">No active devices registered.</td></tr>`;
      return;
    }

    devices.forEach((d) => {
      const tr = document.createElement("tr");
      const isOnline = d.is_online === 1;

      let typeIcon = "💻 Web";
      if (d.device_type === "extension") typeIcon = "🧩 Chrome Extension";
      if (d.device_type === "mobile") typeIcon = "📱 Mobile App";

      const presenceBadge = isOnline
        ? `<span class="badge badge-active"><span class="status-dot-online"></span> ONLINE</span>`
        : `<span class="badge badge-free"><span class="status-dot-offline"></span> OFFLINE</span>`;

      tr.innerHTML = `
        <td>
          <div style="font-weight:600; color:var(--text-main);">${escapeHtml(d.device_name || "Unknown Device")}</div>
          <div style="font-size:11px; color:var(--text-dim);">${escapeHtml(d.platform_os || "OS Unknown")} (ID: ${d.id.slice(0, 10)}...)</div>
        </td>
        <td><span class="badge badge-device">${typeIcon}</span></td>
        <td>
          <div style="font-weight:500;">${escapeHtml(d.user_name || "User")}</div>
          <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(d.user_email || d.user_id)}</div>
        </td>
        <td>
          <div style="font-family:monospace; font-size:12px;">${escapeHtml(d.ip_address || "Unknown IP")}</div>
          <div style="font-size:11px; color:var(--text-dim);">Geo: ${escapeHtml(d.geo_country || "Global")}</div>
        </td>
        <td>${presenceBadge}</td>
        <td style="font-size:12px; color:var(--text-muted);">${timeAgo(new Date(d.last_active_at))}</td>
        <td>
          ${d.status !== "revoked"
            ? `<button class="btn-action danger" onclick="window.revokeDevice('${d.id}')">Disconnect</button>`
            : `<span style="font-size:11px; color:var(--snap-rose);">Revoked</span>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  window.filterDevices = function (type) {
    if (type === "all") {
      renderDevicesTable(devicesData);
    } else {
      renderDevicesTable(devicesData.filter((d) => d.device_type === type));
    }
  };

  // ---------------------------------------------------------------------------
  // Render: Tab 3 Live Activity Feed (Searches & Scans)
  // ---------------------------------------------------------------------------
  function renderActivityTable(activity) {
    const tbody = document.getElementById("activity-tbody");
    tbody.innerHTML = "";

    if (!activity || activity.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-dim);">No recent scans in activity feed.</td></tr>`;
      return;
    }

    activity.forEach((act) => {
      const tr = document.createElement("tr");

      let platformBadge = `<span class="badge badge-user">${act.stream_platform || "Web"}</span>`;
      if (act.stream_platform === "twitch") platformBadge = `<span class="badge" style="background:#9146FF22; color:#A970FF; border:1px solid #9146FF;">Twitch</span>`;
      if (act.stream_platform === "youtube") platformBadge = `<span class="badge" style="background:#FF000022; color:#FF4E4E; border:1px solid #FF0000;">YouTube</span>`;
      if (act.stream_platform === "tiktok") platformBadge = `<span class="badge" style="background:#00F2FE22; color:#00F2FE; border:1px solid #00F2FE;">TikTok</span>`;
      if (act.stream_platform === "camera") platformBadge = `<span class="badge" style="background:#10B98122; color:#10B981; border:1px solid #10B981;">📷 Mobile Camera</span>`;

      const asinLink = act.matched_asin
        ? `<a href="https://www.amazon.com/dp/${act.matched_asin}" target="_blank" style="color:var(--snap-gold); font-family:monospace; font-weight:700; text-decoration:none;">${act.matched_asin} ↗</a>`
        : `<span style="color:var(--text-dim); font-size:11px;">Visual Match</span>`;

      tr.innerHTML = `
        <td style="font-size:11px; color:var(--text-dim); white-space:nowrap;">${timeAgo(new Date(act.created_at))}</td>
        <td>
          ${platformBadge}
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${escapeHtml(act.stream_channel_or_url || "In-page")}</div>
        </td>
        <td>
          <div style="font-weight:600; color:var(--text-main);">${escapeHtml(act.detected_query)}</div>
          ${act.product_title ? `<div style="font-size:11px; color:var(--text-dim);">${escapeHtml(act.product_title.slice(0, 50))}...</div>` : ""}
        </td>
        <td>${asinLink}</td>
        <td>
          <span style="font-weight:700; color:${act.confidence_score >= 80 ? "var(--snap-emerald)" : "var(--snap-gold)"};">
            ${act.confidence_score || 85}%
          </span>
        </td>
        <td>
          <div style="font-size:12px;">${escapeHtml(act.user_name || "Anonymous")}</div>
          <div style="font-size:11px; color:var(--text-dim);">${escapeHtml(act.user_email || "")}</div>
        </td>
        <td><span class="badge badge-device">${act.device_type || "web"}</span></td>
      `;

      tbody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------------------------
  // Render: Tab 4 Streamers & Creators Table
  // ---------------------------------------------------------------------------
  function renderStreamersTable(streamers) {
    const tbody = document.getElementById("streamers-tbody");
    tbody.innerHTML = "";

    if (!streamers || streamers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-dim);">No creators or streamers registered yet.</td></tr>`;
      return;
    }

    streamers.forEach((s) => {
      const tr = document.createElement("tr");

      let channelsObj = {};
      try {
        if (s.stream_channels) channelsObj = JSON.parse(s.stream_channels);
      } catch (_) {}

      const channelPills = Object.entries(channelsObj)
        .filter(([_, v]) => Boolean(v))
        .map(([k, v]) => `<span class="badge badge-user" style="font-size:10px; margin-right:4px;">${k}: ${v}</span>`)
        .join("") || `<span style="color:var(--text-dim); font-size:11px;">No handles linked</span>`;

      tr.innerHTML = `
        <td>
          <div style="font-weight:600; color:var(--text-main);">${escapeHtml(s.name || "Streamer")}</div>
          <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(s.email)}</div>
        </td>
        <td>
          <span style="font-family:monospace; color:var(--snap-gold); font-weight:700;">${escapeHtml(s.affiliate_tag || "Not set")}</span>
        </td>
        <td>${channelPills}</td>
        <td>
          <span class="badge badge-pro">${s.gear_count || 0} Items</span>
        </td>
        <td>
          <div style="font-weight:700; color:var(--snap-emerald);">${s.audience_scans || 0} Scans</div>
        </td>
        <td>
          ${s.streamer_verified ? `<span class="badge badge-active">✓ Verified</span>` : `<span class="badge badge-free">Standard</span>`}
        </td>
        <td>
          <button class="btn-action gold" onclick="window.inspectUser('${s.id}')">View Gear &amp; Stats</button>
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------------------------
  // Render: Tab 6 Audit Trail Table
  // ---------------------------------------------------------------------------
  function renderAuditTable(logs) {
    const tbody = document.getElementById("audit-tbody");
    tbody.innerHTML = "";

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-dim);">No actions in audit log.</td></tr>`;
      return;
    }

    logs.forEach((log) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-family:monospace; font-size:11px; color:var(--text-dim);">${log.id}</td>
        <td>
          <div style="font-weight:500;">${escapeHtml(log.actor_name || "Admin")}</div>
          <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(log.actor_email || log.actor_id)}</div>
        </td>
        <td><span class="badge badge-admin">${escapeHtml(log.action)}</span></td>
        <td><code style="font-size:11px; color:var(--snap-gold);">${escapeHtml(typeof log.detail === "string" ? log.detail : JSON.stringify(log.detail))}</code></td>
        <td style="font-size:11px; color:var(--text-muted);">${timeAgo(new Date(log.created_at))}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------------------------
  // Search & Filters
  // ---------------------------------------------------------------------------
  function setupFilters() {
    function applyFilters() {
      const query = userSearch.value.trim().toLowerCase();
      const role = filterRole.value;
      const plan = filterPlan.value;
      const status = filterStatus.value;

      const filtered = usersData.filter((u) => {
        const matchesQuery = !query ||
          (u.name && u.name.toLowerCase().includes(query)) ||
          (u.email && u.email.toLowerCase().includes(query)) ||
          (u.affiliate_tag && u.affiliate_tag.toLowerCase().includes(query)) ||
          u.id.toLowerCase().includes(query);

        const isStreamer = u.role === "streamer" || u.is_streamer === 1;
        let matchesRole = true;
        if (role === "admin") matchesRole = u.role === "admin";
        if (role === "streamer") matchesRole = isStreamer && u.role !== "admin";
        if (role === "user") matchesRole = !isStreamer && u.role !== "admin";

        const matchesPlan = plan === "all" || u.plan === plan;

        const isBlocked = Boolean(u.blocked_at);
        let matchesStatus = true;
        if (status === "active") matchesStatus = !isBlocked;
        if (status === "blocked") matchesStatus = isBlocked;

        return matchesQuery && matchesRole && matchesPlan && matchesStatus;
      });

      renderUsersTable(filtered);
    }

    userSearch.addEventListener("input", applyFilters);
    filterRole.addEventListener("change", applyFilters);
    filterPlan.addEventListener("change", applyFilters);
    filterStatus.addEventListener("change", applyFilters);
  }

  // ---------------------------------------------------------------------------
  // Modals & Action Handlers
  // ---------------------------------------------------------------------------
  window.closeModal = function (id) {
    document.getElementById(id)?.classList.remove("open");
  };

  function openModal(id) {
    document.getElementById(id)?.classList.add("open");
  }

  // Modal: Role Change
  window.openRoleModal = function (userId, currentRole, isStreamer) {
    modalTargetUserId = userId;
    const select = document.getElementById("role-select");
    select.value = isStreamer && currentRole !== "admin" ? "streamer" : currentRole;
    openModal("modal-role");
  };

  document.getElementById("btn-save-role")?.addEventListener("click", async () => {
    const newRole = document.getElementById("role-select").value;
    if (isDemoMode) {
      const u = usersData.find((x) => x.id === modalTargetUserId);
      if (u) {
        u.role = newRole === "streamer" ? "streamer" : newRole;
        u.is_streamer = newRole === "streamer" ? 1 : 0;
      }
      showToast(`User role updated to ${newRole} (Preview Mode)`);
      closeModal("modal-role");
      renderUsersTable(usersData);
      return;
    }

    const res = await apiCall(`/api/admin/users/${modalTargetUserId}/role`, {
      method: "POST",
      body: JSON.stringify({ role: newRole, isStreamer: newRole === "streamer" })
    });

    if (res.ok) {
      showToast("Role updated successfully!");
      closeModal("modal-role");
      loadUsers();
      loadStats();
    } else {
      showToast(res.error || "Failed to update role", true);
    }
  });

  // Modal: Plan & Quota Change
  window.openPlanModal = function (userId, currentPlan, currentQuota) {
    modalTargetUserId = userId;
    document.getElementById("plan-select").value = currentPlan;
    document.getElementById("quota-input").value = currentQuota || "";
    openModal("modal-plan");
  };

  document.getElementById("btn-save-plan")?.addEventListener("click", async () => {
    const newPlan = document.getElementById("plan-select").value;
    const quotaVal = document.getElementById("quota-input").value.trim();
    const quotaOverride = quotaVal ? parseInt(quotaVal, 10) : null;

    if (isDemoMode) {
      const u = usersData.find((x) => x.id === modalTargetUserId);
      if (u) {
        u.plan = newPlan;
        u.quota_override = quotaOverride;
      }
      showToast("Plan updated (Preview Mode)");
      closeModal("modal-plan");
      renderUsersTable(usersData);
      return;
    }

    const res = await apiCall(`/api/admin/users/${modalTargetUserId}/plan`, {
      method: "POST",
      body: JSON.stringify({ plan: newPlan, quotaOverride })
    });

    if (res.ok) {
      showToast("Plan updated successfully!");
      closeModal("modal-plan");
      loadUsers();
    } else {
      showToast(res.error || "Failed to update plan", true);
    }
  });

  // Modal: Block / Unblock
  let blockModalIsBlocked = false;
  window.openBlockModal = function (userId, isCurrentlyBlocked) {
    modalTargetUserId = userId;
    blockModalIsBlocked = isCurrentlyBlocked;
    document.getElementById("block-modal-title").textContent = isCurrentlyBlocked ? "Restore Account Access" : "Suspend Account";
    document.getElementById("block-modal-desc").textContent = isCurrentlyBlocked ? "Allow this user to sign in and use StreamSnap again?" : "This will immediately revoke active device connections and block API requests.";
    document.getElementById("block-reason-wrap").style.display = isCurrentlyBlocked ? "none" : "block";
    document.getElementById("btn-confirm-block").textContent = isCurrentlyBlocked ? "Restore User" : "Suspend User";
    openModal("modal-block");
  };

  document.getElementById("btn-confirm-block")?.addEventListener("click", async () => {
    const shouldBlock = !blockModalIsBlocked;
    const reason = document.getElementById("block-reason-input").value.trim();

    if (isDemoMode) {
      const u = usersData.find((x) => x.id === modalTargetUserId);
      if (u) {
        u.blocked_at = shouldBlock ? new Date().toISOString() : null;
        u.blocked_reason = shouldBlock ? reason || "Suspended" : null;
      }
      showToast(shouldBlock ? "Account suspended (Demo)" : "Account restored (Demo)");
      closeModal("modal-block");
      renderUsersTable(usersData);
      return;
    }

    const res = await apiCall(`/api/admin/users/${modalTargetUserId}/block`, {
      method: "POST",
      body: JSON.stringify({ blocked: shouldBlock, reason })
    });

    if (res.ok) {
      showToast(shouldBlock ? "User suspended" : "User restored");
      closeModal("modal-block");
      loadUsers();
      loadStats();
    } else {
      showToast(res.error || "Failed to update block state", true);
    }
  });

  // Revoke single device
  window.revokeDevice = async function (deviceId) {
    if (!confirm("Are you sure you want to revoke and disconnect this device session?")) return;

    if (isDemoMode) {
      const dev = devicesData.find((d) => d.id === deviceId);
      if (dev) {
        dev.status = "revoked";
        dev.is_online = 0;
      }
      showToast("Device revoked (Preview Mode)");
      renderDevicesTable(devicesData);
      return;
    }

    const res = await apiCall(`/api/admin/devices/${deviceId}/revoke`, { method: "POST" });
    if (res.ok) {
      showToast("Device connection revoked.");
      loadDevices();
      loadStats();
    } else {
      showToast(res.error || "Failed to revoke device", true);
    }
  };

  // ---------------------------------------------------------------------------
  // Modal: 360° Inspector
  // ---------------------------------------------------------------------------
  window.inspectUser = async function (userId) {
    const u = usersData.find((x) => x.id === userId);
    if (!u) return;

    document.getElementById("inspector-user-title").textContent = `360° Inspection: ${u.name || u.email}`;
    document.getElementById("inspector-user-subtitle").textContent = `ID: ${u.id} | Plan: ${u.plan.toUpperCase()} | Role: ${u.role.toUpperCase()}`;

    openModal("modal-inspector");

    // Containers
    const devList = document.getElementById("inspector-devices-list");
    const cartList = document.getElementById("inspector-cart-list");
    const searchList = document.getElementById("inspector-searches-list");
    const prodList = document.getElementById("inspector-products-list");

    devList.innerHTML = "Loading...";
    cartList.innerHTML = "Loading...";
    searchList.innerHTML = "Loading...";
    prodList.innerHTML = "Loading...";

    if (isDemoMode) {
      // Use demo dataset filtered by user
      const userDevs = DEMO_DEVICES.filter((d) => d.user_id === userId);
      devList.innerHTML = userDevs.length ? userDevs.map((d) => `
        <div class="mini-item-row">
          <div>
            <strong>${escapeHtml(d.device_name)}</strong>
            <div style="color:var(--text-dim); font-size:10px;">${d.device_type} • ${d.ip_address}</div>
          </div>
          <span class="device-pill ${d.is_online ? "online" : ""}">${d.is_online ? "🟢 Online" : "⚪ Offline"}</span>
        </div>
      `).join("") : `<div style="color:var(--text-dim); font-size:12px;">No active devices registered.</div>`;

      cartList.innerHTML = `
        <div class="mini-item-row">
          <div><strong>Shure SM7B Microphone</strong><div style="color:var(--text-dim); font-size:10px;">ASIN: B0002E4Z8M</div></div>
          <span style="color:var(--snap-gold); font-weight:700;">$399.00</span>
        </div>
        <div class="mini-item-row">
          <div><strong>Elgato Key Light Air</strong><div style="color:var(--text-dim); font-size:10px;">ASIN: B082QHRZHM</div></div>
          <span style="color:var(--snap-gold); font-weight:700;">$129.99</span>
        </div>
      `;

      searchList.innerHTML = `
        <div class="mini-item-row">
          <div><strong>Twitch: Kai Cenat Live</strong><div style="color:var(--text-dim); font-size:10px;">Query: Nike Tech Fleece</div></div>
          <span style="color:var(--snap-emerald); font-weight:700;">94% Match</span>
        </div>
        <div class="mini-item-row">
          <div><strong>YouTube Live Audio Setup</strong><div style="color:var(--text-dim); font-size:10px;">Query: Shure SM7B</div></div>
          <span style="color:var(--snap-emerald); font-weight:700;">98% Match</span>
        </div>
      `;

      prodList.innerHTML = `
        <div class="mini-item-row">
          <div><strong>Sony WH-1000XM5 Headphones</strong></div>
          <span style="color:var(--text-dim); font-size:11px;">Saved from Twitch</span>
        </div>
      `;
      return;
    }

    const res = await apiCall(`/api/admin/users/${userId}/details`);
    if (res.ok) {
      // Render devices
      const devs = res.devices || [];
      devList.innerHTML = devs.length ? devs.map((d) => `
        <div class="mini-item-row">
          <div>
            <strong>${escapeHtml(d.device_name)}</strong>
            <div style="color:var(--text-dim); font-size:10px;">${d.device_type} • ${d.ip_address || "IP Unknown"}</div>
          </div>
          <span class="device-pill ${d.is_online ? "online" : ""}">${d.is_online ? "🟢 Online" : "⚪ Offline"}</span>
        </div>
      `).join("") : `<div style="color:var(--text-dim); font-size:12px;">No devices connected.</div>`;

      // Render cart
      const cart = res.cart || [];
      cartList.innerHTML = cart.length ? cart.map((c) => `
        <div class="mini-item-row">
          <div><strong>${escapeHtml(c.title)}</strong><div style="color:var(--text-dim); font-size:10px;">ASIN: ${c.asin}</div></div>
          <span style="color:var(--snap-gold); font-weight:700;">${c.price ? `$${c.price}` : "Staged"}</span>
        </div>
      `).join("") : `<div style="color:var(--text-dim); font-size:12px;">Cart is empty.</div>`;

      // Render searches
      const searches = res.searches || [];
      searchList.innerHTML = searches.length ? searches.map((s) => `
        <div class="mini-item-row">
          <div><strong>${escapeHtml(s.detected_query)}</strong><div style="color:var(--text-dim); font-size:10px;">${s.stream_platform} • ${s.device_type}</div></div>
          <span style="color:var(--snap-emerald); font-weight:700;">${s.confidence_score || 85}%</span>
        </div>
      `).join("") : `<div style="color:var(--text-dim); font-size:12px;">No searches recorded.</div>`;

      // Render products / gear
      const prods = res.products || [];
      const gear = res.gear || [];
      const combined = [...prods, ...gear];
      prodList.innerHTML = combined.length ? combined.map((p) => `
        <div class="mini-item-row">
          <div><strong>${escapeHtml(p.title)}</strong></div>
          <span style="color:var(--text-dim); font-size:11px;">${p.category || "Gear"}</span>
        </div>
      `).join("") : `<div style="color:var(--text-dim); font-size:12px;">No saved products.</div>`;
    }
  };

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function showToast(message, isError = false) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    if (isError) toast.style.borderColor = "var(--snap-rose)";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function timeAgo(date) {
    if (!date || isNaN(date.getTime())) return "Never";
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 5) return "Just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // Run
  document.addEventListener("DOMContentLoaded", init);
})();
