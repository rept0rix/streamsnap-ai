/**
 * StreamSnap AI — Side Panel Controller
 *
 * Rendering rule: product titles, match reasons and stream titles originate
 * from the vision model and from page metadata. None of it is trusted, so
 * cards are built with createElement/textContent rather than innerHTML.
 */

import {
  getAmazonCartUrl,
  getAmazonProductUrl,
  getAmazonSearchUrl,
  getWebSearchUrl,
  getAllStoreSearchUrls,
  SUPPORTED_STORES,
  isVerifiedAsin
} from "../services/amazon_service.js";
import {
  signIn,
  signOut,
  fetchProfile,
  deleteAccount,
  saveAffiliateTag,
  sendHeartbeat,
  syncCloudState,
  syncCartEvent,
  recordSearchEvent
} from "../services/account.js";
import { CURRENT_BUILD, VERSION_HISTORY } from "../services/version_info.js";
import { checkVersionGate } from "../services/version_gate.js";

const state = {
  scan: null,
  catalog: [],
  cart: [],
  categoryFilter: "all",
  searchQuery: "",
  tierFilter: "all",
  affiliateTag: "streamsnap03-20"
};

/** Maps the filter pill values in the HTML to catalog category names. */
const CATEGORY_ALIASES = {
  fitness: ["gym & fitness"],
  fashion: ["streetwear & apparel"],
  audio: ["audio & mic", "headphones", "gaming & gear"],
  lighting: ["studio lighting"],
  costume: ["cosplay & costume"]
};

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initListeners();
  initSettings();
  initAccount();
  initCatalogFilters();
  initModal();
  initOnboarding();
  initMasterToggle();
  loadInitialData();
  initVersionGate();
});

// ---------------------------------------------------------------------------
// Version gate — hard-blocks the panel when this build is too old.
// ---------------------------------------------------------------------------

async function initVersionGate() {
  const overlay = byId("update-required-overlay");
  const recheckBtn = byId("update-recheck-btn");
  const banner = byId("update-available-banner");
  const bannerTitle = byId("update-banner-title");
  const bannerDesc = byId("update-banner-desc");
  const bannerBtn = byId("update-banner-action-btn");
  const bannerDismiss = byId("update-banner-dismiss-btn");

  bannerDismiss?.addEventListener("click", () => {
    if (banner) banner.style.display = "none";
    sessionStorage.setItem("dismissedUpdate", "true");
  });

  async function run() {
    // 1. Check if an update was already staged in background
    const { updateReady, stagedVersion } = await chrome.storage.local.get([
      "updateReady",
      "stagedVersion"
    ]);

    if (updateReady) {
      if (banner) {
        banner.style.display = "flex";
        if (bannerTitle) bannerTitle.textContent = "🎉 Update ready to install!";
        if (bannerDesc) bannerDesc.textContent = `StreamSnap v${stagedVersion || "new"} is downloaded.`;
        if (bannerBtn) {
          bannerBtn.textContent = "Restart Now ↺";
          bannerBtn.removeAttribute("href");
          bannerBtn.removeAttribute("target");
          bannerBtn.onclick = (e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({ action: "RELOAD_EXTENSION" });
          };
        }
      }
      return;
    }

    let result;
    try {
      result = await checkVersionGate();
    } catch {
      return; // never brick the panel on an unexpected error
    }

    // Sync action badge
    chrome.runtime.sendMessage({ action: "SYNC_BADGE" }).catch(() => {});

    // Hard block
    if (result.blocked) {
      if (banner) banner.style.display = "none";
      const cur = byId("update-current-version");
      const min = byId("update-min-version");
      const text = byId("update-required-text");
      const link = byId("update-site-link");
      if (cur) cur.textContent = `v${result.currentVersion}`;
      if (min) min.textContent = `v${result.minVersion || "?"}`;
      if (text) {
        text.textContent = `This copy of StreamSnap (v${result.currentVersion}) is no longer supported. Update to v${result.minVersion} or newer to keep scanning.`;
      }
      if (link && result.updateUrl) link.href = result.updateUrl;
      if (overlay) overlay.style.display = "flex";
      return;
    }

    if (overlay) overlay.style.display = "none";

    // Soft update notification
    if (result.updateAvailable && sessionStorage.getItem("dismissedUpdate") !== "true") {
      if (banner) {
        banner.style.display = "flex";
        if (bannerTitle) bannerTitle.textContent = `StreamSnap v${result.latestVersion} available! 🚀`;
        if (bannerDesc) bannerDesc.textContent = "New models and live detection features ready.";
        if (bannerBtn) {
          bannerBtn.textContent = "Update ↗";
          bannerBtn.href = result.updateUrl || "https://streamsnap.online";
          bannerBtn.target = "_blank";
          bannerBtn.onclick = null;
        }
      }
    } else {
      if (banner) banner.style.display = "none";
    }
  }

  recheckBtn?.addEventListener("click", async () => {
    recheckBtn.disabled = true;
    const original = recheckBtn.textContent;
    recheckBtn.textContent = "Checking…";
    await run();
    recheckBtn.disabled = false;
    recheckBtn.textContent = original;
  });

  await run();
}

// ---------------------------------------------------------------------------
// Master on/off switch
//
// A single flag, extensionEnabled, gates the whole product. When off: scanning
// is refused here and in the service worker, the on-video controls are removed,
// and a full guard screen makes the state unmistakable.
// ---------------------------------------------------------------------------

let appEnabled = true;

function paintMasterToggle(enabled) {
  appEnabled = enabled;
  const toggle = byId("master-power-toggle");
  const label = byId("power-toggle-lbl");
  const guard = byId("disabled-guard-overlay");
  const container = document.querySelector(".panel-container");

  if (toggle) {
    toggle.classList.toggle("is-on", enabled);
    toggle.setAttribute("aria-checked", String(enabled));
  }
  if (label) label.textContent = enabled ? "ON" : "OFF";
  if (container) container.classList.toggle("app-disabled", !enabled);
  // The update gate outranks the OFF guard; don't cover an update screen.
  const updateShowing = byId("update-required-overlay")?.style.display === "flex";
  if (guard) guard.style.display = enabled || updateShowing ? "none" : "flex";
}

function initMasterToggle() {
  chrome.storage.local.get(["extensionEnabled"], (res = {}) => {
    paintMasterToggle(res.extensionEnabled !== false);
  });

  byId("master-power-toggle")?.addEventListener("click", () => {
    const next = !appEnabled;
    chrome.storage.local.set({ extensionEnabled: next });
    paintMasterToggle(next);
  });

  byId("guard-enable-btn")?.addEventListener("click", () => {
    chrome.storage.local.set({ extensionEnabled: true });
    paintMasterToggle(true);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.extensionEnabled) {
      paintMasterToggle(changes.extensionEnabled.newValue !== false);
    }
  });
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function createSvgIcon(name, size = 12) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("btn-icon-svg");
  svg.style.marginRight = "3px";
  svg.style.verticalAlign = "middle";

  const paths = {
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>',
    cart: '<circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>',
    globe: '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',
    trash: '<path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    target: '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path>'
  };

  svg.innerHTML = paths[name] || paths.zap;
  return svg;
}

function byId(id) {
  return document.getElementById(id);
}

function show(id, visible, display = "block") {
  const node = byId(id);
  if (node) node.style.display = visible ? display : "none";
}

function truncate(value, max) {
  const str = String(value ?? "");
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function formatPrice(price) {
  return typeof price === "number" && Number.isFinite(price) ? `$${price.toFixed(2)}` : null;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      byId(`tab-${btn.dataset.tab}`)?.classList.add("active");

      if (btn.dataset.tab === "catalog") renderCatalog();
      else if (btn.dataset.tab === "analytics") renderAnalytics();
      else if (btn.dataset.tab === "cart") renderCart(state.cart);
    });
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function flashSaved(button) {
  const original = button.textContent;
  button.textContent = "Saved ✓";
  button.style.background = "#10B981";
  setTimeout(() => {
    button.textContent = original;
    button.style.background = "";
  }, 1500);
}

function initSettings() {
  const keyInput = byId("gemini-api-key-input");
  const saveKeyBtn = byId("save-api-key-btn");
  const keyStatus = byId("api-key-status");
  const autoScanSelect = byId("auto-scan-select");
  const confSlider = byId("confidence-slider");
  const confVal = byId("confidence-val");
  const tagInput = byId("affiliate-tag-input");
  const saveTagBtn = byId("save-tag-btn");

  function paintKeyStatus(hasKey) {
    if (keyStatus) {
      keyStatus.textContent = hasKey
        ? "Key saved — Gemini Vision active"
        : "No API key. Sign in above to use Cloudflare proxy or add a key.";
      keyStatus.style.color = hasKey ? "#10B981" : "#F59E0B";
    }

    const keyDetails = byId("gemini-key-details");
    const keyBadge = byId("gemini-key-badge");

    if (hasKey) {
      if (keyDetails) keyDetails.open = true;
      if (keyBadge) {
        keyBadge.className = "gemini-key-badge active";
        keyBadge.textContent = "● Key Active";
        keyBadge.style.display = "inline-flex";
      }
    } else {
      if (keyBadge) {
        keyBadge.className = "gemini-key-badge inactive";
        keyBadge.textContent = "No Key";
        keyBadge.style.display = "none";
      }
    }
  }

  // Populate dynamic version tracking
  const versionTag = byId("panel-version-tag");
  const versionTime = byId("panel-version-time");
  const versionTitle = byId("panel-version-title");
  const changelogList = byId("panel-changelog-list");
  const footerVersionTag = byId("footer-version-tag");

  if (versionTag) versionTag.textContent = `v${CURRENT_BUILD.version}`;
  if (versionTime) versionTime.textContent = CURRENT_BUILD.buildTimestamp;
  if (versionTitle) versionTitle.textContent = CURRENT_BUILD.title;

  if (changelogList && Array.isArray(CURRENT_BUILD.highlights)) {
    changelogList.replaceChildren();
    for (const item of CURRENT_BUILD.highlights) {
      const li = document.createElement("li");
      li.textContent = item;
      changelogList.appendChild(li);
    }
  }

  if (footerVersionTag) {
    footerVersionTag.textContent = `v${CURRENT_BUILD.version} (${CURRENT_BUILD.buildDate} ${CURRENT_BUILD.buildTime})`;
    footerVersionTag.title = `StreamSnap AI v${CURRENT_BUILD.version} Built ${CURRENT_BUILD.buildTimestamp} — Click to open Release Notes`;
    footerVersionTag.addEventListener("click", () => {
      document.querySelector('[data-tab="settings"]')?.click();
    });
  }

  const floatingControlsToggle = byId("toggle-floating-controls-checkbox");

  chrome.storage.local.get(
    ["geminiApiKey", "autoScanIntervalSec", "minConfidence", "affiliateTag", "showFloatingControls"],
    (res = {}) => {
      if (keyInput && res.geminiApiKey) keyInput.value = res.geminiApiKey;
      paintKeyStatus(Boolean(res.geminiApiKey));

      if (floatingControlsToggle && res.showFloatingControls !== undefined) {
        floatingControlsToggle.checked = Boolean(res.showFloatingControls);
      }

      if (autoScanSelect && res.autoScanIntervalSec !== undefined) {
        autoScanSelect.value = String(res.autoScanIntervalSec);
      }
      if (confSlider && res.minConfidence !== undefined) {
        confSlider.value = res.minConfidence;
        if (confVal) confVal.textContent = `${res.minConfidence}%`;
      }
      if (res.affiliateTag) {
        state.affiliateTag = res.affiliateTag;
        if (tagInput) tagInput.value = res.affiliateTag;
        const label = byId("active-tag-label");
        if (label) label.textContent = res.affiliateTag;
      }
    }
  );

  floatingControlsToggle?.addEventListener("change", () => {
    chrome.storage.local.set({ showFloatingControls: floatingControlsToggle.checked });
  });

  saveKeyBtn?.addEventListener("click", () => {
    const key = keyInput.value.trim();
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      paintKeyStatus(Boolean(key));
      flashSaved(saveKeyBtn);
    });
  });

  autoScanSelect?.addEventListener("change", () => {
    chrome.storage.local.set({ autoScanIntervalSec: parseInt(autoScanSelect.value, 10) || 0 });
  });

  confSlider?.addEventListener("input", () => {
    if (confVal) confVal.textContent = `${confSlider.value}%`;
  });
  confSlider?.addEventListener("change", () => {
    chrome.storage.local.set({ minConfidence: parseInt(confSlider.value, 10) });
  });

  saveTagBtn?.addEventListener("click", () => {
    const raw = tagInput.value.trim();
    if (raw && !/^[A-Za-z0-9_-]{3,25}$/.test(raw)) {
      tagInput.setCustomValidity("Use 3-25 letters, numbers, hyphens or underscores.");
      tagInput.reportValidity();
      return;
    }
    tagInput.setCustomValidity("");
    const tag = raw || "streamsnap03-20";
    state.affiliateTag = tag;
    chrome.storage.local.set({ affiliateTag: tag }, () => {
      const label = byId("active-tag-label");
      if (label) label.textContent = tag;
      flashSaved(saveTagBtn);
      renderCatalog();
    });
    // Also persist server-side when signed in, so the tag follows the account
    // across devices rather than living only in this browser.
    saveAffiliateTag(tag).catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

function renderHeaderAccount(profile) {
  const signedIn = Boolean(profile?.signedIn);
  const user = profile?.user || {};

  show("header-account-in", signedIn, "flex");
  show("header-account-out", !signedIn, "flex");
  if (!signedIn) return;

  const nameEl = byId("header-account-name");
  const emailEl = byId("header-account-email");
  const avatar = byId("header-avatar");

  if (nameEl) nameEl.textContent = user.name || "Signed in";
  if (emailEl) emailEl.textContent = user.email || "";
  if (avatar) {
    if (user.avatarUrl) {
      avatar.src = user.avatarUrl;
      avatar.style.display = "block";
      avatar.addEventListener("error", () => { avatar.style.display = "none"; }, { once: true });
    } else {
      avatar.style.display = "none";
    }
  }
}

function updateAuthGates(signedIn) {
  state.signedIn = Boolean(signedIn);

  // 0. Live Scan Gate: Must sign in before use, unless already signed in
  const scanGate = byId("scan-auth-gate");
  const scanEmpty = byId("scan-empty-state");
  const scanResults = byId("scan-results-view");
  const scanLoading = byId("scan-loading-state");

  if (scanGate) scanGate.style.display = signedIn ? "none" : "flex";
  if (!signedIn) {
    if (scanEmpty) scanEmpty.style.display = "none";
    if (scanResults) scanResults.style.display = "none";
    if (scanLoading) scanLoading.style.display = "none";
  } else {
    // When signed in, restore standard scanner display state
    const hasResults = Boolean(
      (state.latestScan?.items?.exactMatches?.length || 0) +
      (state.latestScan?.items?.lookAlikes?.length || 0) > 0
    );
    if (hasResults) {
      if (scanResults) scanResults.style.display = "block";
      if (scanEmpty) scanEmpty.style.display = "none";
    } else {
      if (scanEmpty) scanEmpty.style.display = "block";
      if (scanResults) scanResults.style.display = "none";
    }
  }

  // 1. Catalog / History Gate
  const catalogGate = byId("catalog-auth-gate");
  const catalogAuthView = byId("catalog-authenticated-view");
  if (catalogGate) catalogGate.style.display = signedIn ? "none" : "flex";
  if (catalogAuthView) catalogAuthView.style.display = signedIn ? "block" : "none";

  // 2. Cart Gate
  const cartGate = byId("cart-auth-gate");
  const cartAuthView = byId("cart-authenticated-view");
  if (cartGate) cartGate.style.display = signedIn ? "none" : "flex";
  if (cartAuthView) cartAuthView.style.display = signedIn ? "block" : "none";

  // 3. Analytics / Stats Gate
  const analyticsGate = byId("analytics-auth-gate");
  const analyticsAuthView = byId("analytics-authenticated-view");
  if (analyticsGate) analyticsGate.style.display = signedIn ? "none" : "flex";
  if (analyticsAuthView) analyticsAuthView.style.display = signedIn ? "block" : "none";

  // 4. Update Tab Badge Counts: when signed out, show 0 instead of stale local counts
  const catalogCount = byId("catalog-count");
  if (catalogCount) catalogCount.textContent = signedIn ? String(state.catalog.length) : "0";
  const cartCount = byId("cart-count");
  if (cartCount) cartCount.textContent = signedIn ? String(state.cart.reduce((sum, i) => sum + (i.quantity || 1), 0)) : "0";
}

function renderAccount(profile) {
  const signedIn = Boolean(profile?.signedIn);
  show("account-signed-out", !signedIn);
  show("account-signed-in", signedIn);
  renderHeaderAccount(profile);
  updateAuthGates(signedIn);

  if (signedIn) {
    chrome.storage.local.get(["discoveredCatalog", "cartItems"], (res = {}) => {
      if (Array.isArray(res.discoveredCatalog)) state.catalog = res.discoveredCatalog;
      if (Array.isArray(res.cartItems)) state.cart = res.cartItems;
      renderCatalog();
      renderCart(state.cart);
    });
  }

  if (!signedIn) return;

  const user = profile.user || {};
  const nameEl = byId("account-name");
  const emailEl = byId("account-email");
  const avatar = byId("account-avatar");

  if (nameEl) nameEl.textContent = user.name || "Signed in";
  if (emailEl) emailEl.textContent = user.email || "";
  if (avatar) {
    if (user.avatarUrl) {
      avatar.src = user.avatarUrl;
      avatar.style.display = "block";
      avatar.addEventListener("error", () => { avatar.style.display = "none"; }, { once: true });
    } else {
      avatar.style.display = "none";
    }
  }

  if (user.affiliateTag) {
    state.affiliateTag = user.affiliateTag;
    const input = byId("affiliate-tag-input");
    if (input && !input.value) input.value = user.affiliateTag;
  }

  const quota = profile.quota || {};
  const used = quota.used ?? 0;
  const limit = quota.limit ?? 0;

  const quotaText = byId("quota-text");
  if (quotaText) {
    quotaText.textContent = profile.stale
      ? `${used} of ${limit} scans used (offline)`
      : `${used} of ${limit} scans used this month`;
  }

  const planEl = byId("quota-plan");
  if (planEl) planEl.textContent = (user.plan || "free").toUpperCase();

  const fill = byId("quota-fill");
  if (fill && limit > 0) {
    const pct = Math.min(100, Math.round((used / limit) * 100));
    fill.style.width = `${pct}%`;
    fill.style.background = pct >= 90 ? "#EF4444" : pct >= 70 ? "#F59E0B" : "#10B981";
  }
}

function showSignInError(message) {
  const box = byId("signin-error");
  if (!box) return;
  box.textContent = message;
  box.style.display = message ? "block" : "none";
}

async function runSignIn(btn, restoreText) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Opening Google…";
  }
  showSignInError("");
  try {
    const profile = await signIn();
    renderAccount(profile);
  } catch (err) {
    showSignInError(err.message || "Sign-in failed.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = restoreText;
    }
  }
}

async function runSignOut() {
  await signOut();
  renderAccount({ signedIn: false });
}

function initAccount() {
  fetchProfile().then(renderAccount);

  // Send periodic device heartbeat every 2 minutes while panel is active
  setInterval(() => {
    sendHeartbeat().catch(() => {});
  }, 120000);

  byId("signin-btn")?.addEventListener("click", (e) =>
    runSignIn(e.currentTarget, "Continue with Google")
  );
  byId("header-signin-btn")?.addEventListener("click", (e) =>
    runSignIn(e.currentTarget, "Sign in with Google")
  );

  // Wire gate buttons across all tabs
  document.querySelectorAll(".gate-signin-btn").forEach((btn) => {
    btn.addEventListener("click", (e) =>
      runSignIn(e.currentTarget, "Continue with Google")
    );
  });

  byId("signout-btn")?.addEventListener("click", runSignOut);
  byId("header-signout-btn")?.addEventListener("click", runSignOut);

  byId("delete-account-btn")?.addEventListener("click", async () => {
    const warning =
      "Permanently delete your StreamSnap account?\n\n" +
      "This removes your profile, saved products and usage history from our servers. " +
      "It cannot be undone.";
    if (!confirm(warning)) return;
    if (prompt('Type DELETE to confirm.') !== "DELETE") return;

    try {
      await deleteAccount();
      renderAccount({ signedIn: false });
      alert("Your account and all its data have been deleted.");
    } catch (err) {
      alert(`Could not delete the account: ${err.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function initCatalogFilters() {
  document.querySelectorAll("#catalog-category-pills .filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document
        .querySelectorAll("#catalog-category-pills .filter-pill")
        .forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.categoryFilter = pill.dataset.cat;
      renderCatalog();
    });
  });

  byId("catalog-search-input")?.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderCatalog();
  });

  byId("clear-catalog-btn")?.addEventListener("click", () => {
    if (confirm("Clear your saved product history? This cannot be undone.")) {
      chrome.runtime.sendMessage({ action: "CLEAR_CATALOG" });
    }
  });

  document.querySelectorAll("#live-filter-pills .filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document
        .querySelectorAll("#live-filter-pills .filter-pill")
        .forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.tierFilter = pill.dataset.filter;
      applyTierFilter();
    });
  });
}

function applyTierFilter() {
  show("tier1-section", state.tierFilter !== "lookalike");
  show("tier2-section", state.tierFilter !== "exact");
}

// ---------------------------------------------------------------------------
// Source frame modal
// ---------------------------------------------------------------------------

function initModal() {
  const modal = byId("source-frame-modal");
  byId("close-modal-btn")?.addEventListener("click", () => {
    modal.style.display = "none";
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal) modal.style.display = "none";
  });
}

// ---------------------------------------------------------------------------
// Onboarding Integration
// ---------------------------------------------------------------------------

function initOnboarding() {
  const banner = byId("onboarding-welcome-banner");
  const openBannerBtn = byId("open-onboarding-banner-btn");
  const dismissBannerBtn = byId("dismiss-onboarding-banner-btn");
  const launchWizardBtn = byId("launch-onboarding-wizard-btn");

  function openOnboardingPage() {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  }

  openBannerBtn?.addEventListener("click", openOnboardingPage);
  launchWizardBtn?.addEventListener("click", openOnboardingPage);

  dismissBannerBtn?.addEventListener("click", () => {
    if (banner) banner.style.display = "none";
    chrome.storage.local.set({ onboardingCompleted: true });
  });

  // Check onboarding status
  chrome.storage.local.get(["onboardingCompleted"], (res = {}) => {
    if (!res.onboardingCompleted && banner) {
      banner.style.display = "flex";
    } else if (banner) {
      banner.style.display = "none";
    }
  });
}

function openSourceFrameModal(prod) {
  const modal = byId("source-frame-modal");
  const sourceImg = byId("modal-source-img");
  const prodImg = byId("modal-product-img");
  const prodCol = prodImg?.closest(".comparison-col");

  const fallback = placeholderThumbnail(prod);
  const sourceSrc =
    prod.sourceCrop || prod.thumbnail || state.scan?.croppedThumbnail || state.scan?.frameSnapshot || fallback;

  sourceImg.src = sourceSrc;
  sourceImg.onerror = () => {
    sourceImg.src = fallback;
  };

  const hasRealCatalogImage = Boolean(
    prod.image &&
    typeof prod.image === "string" &&
    (prod.image.startsWith("http://") || prod.image.startsWith("https://")) &&
    prod.image !== prod.sourceCrop &&
    prod.image !== prod.thumbnail
  );

  if (hasRealCatalogImage) {
    if (prodCol) prodCol.style.display = "flex";
    prodImg.src = prod.image;
    prodImg.onerror = () => {
      prodImg.src = fallback;
    };
  } else {
    if (prodCol) prodCol.style.display = "none";
  }

  byId("modal-stream-name").textContent =
    prod.streamTitle || prod.lastStream || state.scan?.streamType || "Live Stream";
  byId("modal-product-title").textContent = prod.title || "Detected item";
  byId("modal-product-price").textContent = formatPrice(prod.price) || "Price on Amazon";
  byId("modal-detection-label").textContent =
    prod.matchReason || prod.detectionLabel || "Detected in the live video frame";

  modal.style.display = "flex";
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

function initListeners() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.isScanning?.newValue) showScanningState();
    // A scan that ends without a result (aborted capture, no credential on a
    // page-initiated scan) flips isScanning back to false. Without this the
    // loading spinner would hang forever — the classic "stuck, not searching".
    if (changes.isScanning && changes.isScanning.newValue === false) clearScanningIfIdle();
    if (changes.lastScanError?.newValue) showScanError(changes.lastScanError.newValue);
    if (changes.latestScanResults?.newValue) renderScanResults(changes.latestScanResults.newValue);
    if (changes.discoveredCatalog) {
      state.catalog = changes.discoveredCatalog.newValue || [];
      renderCatalog();
    }
    if (changes.cartItems) renderCart(changes.cartItems.newValue || []);
    if (changes.analytics?.newValue) renderAnalytics(changes.analytics.newValue);
    if (changes.onboardingCompleted) {
      const banner = byId("onboarding-welcome-banner");
      if (banner) {
        banner.style.display = changes.onboardingCompleted.newValue ? "none" : "flex";
      }
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    switch (message.action) {
      case "SCAN_RESULTS_UPDATED":
        renderScanResults(message.data);
        if (Array.isArray(message.data) && message.data[0]) {
          const top = message.data[0];
          recordSearchEvent({
            streamPlatform: "web",
            query: top.title || "Live Stream Scan",
            asin: top.asin,
            title: top.title,
            confidence: top.confidence || 85
          }).catch(() => {});
        }
        break;
      case "SCAN_FAILED":
        showScanError(message.error);
        break;
      case "CATALOG_UPDATED":
        state.catalog = message.discoveredCatalog || [];
        renderCatalog();
        break;
      case "CART_UPDATED":
        renderCart(message.cartItems || []);
        break;
      case "ANALYTICS_UPDATED":
        renderAnalytics(message.analytics);
        break;
      case "SCAN_CLEARED":
      case "SETTINGS_RESET":
      case "ALL_DATA_DELETED":
        refreshStorageReport();
        break;
    }
  });

  byId("direct-scan-btn")?.addEventListener("click", triggerDirectScan);
  byId("radar-scan-trigger")?.addEventListener("click", triggerDirectScan);
  byId("rescan-btn")?.addEventListener("click", triggerDirectScan);
  byId("retry-scan-btn")?.addEventListener("click", triggerDirectScan);

  byId("clear-live-btn")?.addEventListener("click", () => {
    liveSessionFeed = { exactMatches: [], lookAlikes: [] };
    state.scan = null;
    chrome.storage.local.remove(["latestScanResults"], () => {
      show("scan-results-container", false);
      show("scan-loading-state", false);
      show("scan-error-state", false);
      show("scan-empty-state", true);
      const countBadge = byId("scanned-count");
      if (countBadge) countBadge.textContent = "0";
    });
  });

  byId("clear-cart-btn")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "CLEAR_CART" });
  });

  initDeletion();
}

// ---------------------------------------------------------------------------
// Deletion
//
// Anything stored must be removable by the person it belongs to. Each action
// confirms first, then refreshes the report so the effect is visible rather
// than assumed.
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function refreshStorageReport() {
  const box = byId("storage-report");
  if (!box) return;

  chrome.runtime.sendMessage({ action: "GET_STORAGE_REPORT" }, (r) => {
    if (!r) {
      box.textContent = "Could not read storage.";
      return;
    }

    box.replaceChildren();
    const rows = [
      ["Total stored", formatBytes(r.totalBytes)],
      ["Gemini API key", r.hasApiKey ? "saved on this device" : "none"],
      ["Affiliate tag", r.hasAffiliateTag ? "saved" : "none"],
      ["Product history", `${r.catalogCount} items · ${formatBytes(r.historyBytes)}`],
      ["Cart", `${r.cartCount} items`],
      ["Last scanned frame", r.hasLastScan ? formatBytes(r.lastScanBytes) : "none"]
    ];

    for (const [label, value] of rows) {
      const row = el("div", "storage-row");
      row.append(el("span", "storage-key", label), el("span", "storage-val", value));
      box.appendChild(row);
    }
  });
}

function wireDelete(id, { confirmText, action, extra }) {
  byId(id)?.addEventListener("click", () => {
    if (!confirm(confirmText)) return;
    chrome.runtime.sendMessage({ action }, () => {
      if (extra) extra();
      refreshStorageReport();
    });
  });
}

function initDeletion() {
  refreshStorageReport();

  wireDelete("delete-key-btn", {
    confirmText: "Remove your Gemini API key from this device? Scanning will stop working until you add one again.",
    action: "DELETE_API_KEY",
    extra: () => {
      const input = byId("gemini-api-key-input");
      if (input) input.value = "";
      const status = byId("api-key-status");
      if (status) {
        status.textContent = "No API key. Scanning is disabled until you add one.";
        status.style.color = "#F59E0B";
      }
    }
  });

  wireDelete("delete-tag-btn", {
    confirmText: "Remove your affiliate tag? Links will fall back to the default tag.",
    action: "DELETE_AFFILIATE_TAG",
    extra: () => {
      const input = byId("affiliate-tag-input");
      if (input) input.value = "";
      state.affiliateTag = "streamsnap03-20";
    }
  });

  wireDelete("delete-lastscan-btn", {
    confirmText: "Delete the last scanned frame? This is the image from your most recent scan.",
    action: "DELETE_LAST_SCAN",
    extra: () => {
      state.scan = null;
      show("scan-results-container", false);
      show("scan-error-state", false);
      show("scan-empty-state", true);
    }
  });

  wireDelete("delete-history-btn", {
    confirmText: "Delete your saved product history? This cannot be undone.",
    action: "CLEAR_CATALOG"
  });

  wireDelete("delete-cart-btn", {
    confirmText: "Empty your cart?",
    action: "CLEAR_CART"
  });

  wireDelete("reset-stats-btn", {
    confirmText: "Reset your scan and click statistics to zero?",
    action: "RESET_ANALYTICS"
  });

  byId("delete-all-btn")?.addEventListener("click", () => {
    const warning =
      "Delete EVERYTHING StreamSnap has stored?\n\n" +
      "This removes your API key, affiliate tag, product history, cart, statistics, " +
      "the last scanned frame, and all settings.\n\n" +
      "This cannot be undone.";
    if (!confirm(warning)) return;
    // Typed confirmation, because this is unrecoverable.
    const typed = prompt('Type DELETE to confirm.');
    if (typed !== "DELETE") return;

    chrome.runtime.sendMessage({ action: "DELETE_ALL_DATA" }, () => {
      window.location.reload();
    });
  });
}

// ---------------------------------------------------------------------------
// Live Session Accumulation State
// ---------------------------------------------------------------------------
let liveSessionFeed = {
  exactMatches: [],
  lookAlikes: []
};

function showScanningState() {
  const hasExistingResults =
    liveSessionFeed.exactMatches.length > 0 || liveSessionFeed.lookAlikes.length > 0;

  if (hasExistingResults) {
    // Non-disruptive radar banner while preserving existing cards
    show("scan-empty-state", false);
    show("scan-loading-state", false);
    show("scan-error-state", false);
    show("scan-results-container", true);

    const liveProgressBar = byId("scan-live-progress");
    if (liveProgressBar) liveProgressBar.style.display = "flex";
  } else {
    // First time scan: show the full-screen scanning animation
    show("scan-empty-state", false);
    show("scan-error-state", false);
    show("scan-results-container", false);
    show("scan-loading-state", true);
  }
}

/**
 * Called when a scan ends (isScanning → false) but no result or error arrived.
 * Drops the loading spinner back to the last sensible state so the panel never
 * hangs on "AI Vision Scanning…".
 */
function clearScanningIfIdle() {
  const loading = byId("scan-loading-state");
  if (!loading || loading.style.display === "none") return; // not spinning

  const liveProgressBar = byId("scan-live-progress");
  if (liveProgressBar) liveProgressBar.style.display = "none";

  const hasResults =
    liveSessionFeed.exactMatches.length > 0 || liveSessionFeed.lookAlikes.length > 0;

  show("scan-loading-state", false);
  if (hasResults) {
    show("scan-results-container", true);
  } else {
    show("scan-error-state", false);
    show("scan-results-container", false);
    show("scan-empty-state", true);
  }
}

function showScanError(message) {
  const liveProgressBar = byId("scan-live-progress");
  if (liveProgressBar) liveProgressBar.style.display = "none";

  const hasExistingResults =
    liveSessionFeed.exactMatches.length > 0 || liveSessionFeed.lookAlikes.length > 0;

  if (hasExistingResults) {
    // If we already have items, don't wipe them on a temporary error; just show a toast
    const notice = byId("filter-notice");
    if (notice) {
      notice.textContent = `⚠️ Scan warning: ${message || "Could not complete latest frame scan."}`;
      notice.style.display = "block";
    }
  } else {
    show("scan-loading-state", false);
    show("scan-results-container", false);
    show("scan-empty-state", false);
    const text = byId("scan-error-text");
    if (text) text.textContent = message || "The scan could not be completed.";
    show("scan-error-state", true);
  }
}

function triggerDirectScan() {
  if (!appEnabled) {
    const guard = byId("disabled-guard-overlay");
    if (guard) guard.style.display = "flex";
    return;
  }
  showScanningState();

  chrome.storage.local.get(["geminiApiKey"], (res = {}) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const streamTitle = tabs?.[0]?.title || "Live Stream";

      chrome.runtime.sendMessage({ action: "CAPTURE_VISIBLE_TAB" }, (capture) => {
        if (!capture?.dataUrl) {
          showScanError(
            capture?.error ||
              "Could not capture this tab. StreamSnap works on YouTube, Twitch, TikTok, Facebook and Kick."
          );
          return;
        }

        chrome.runtime.sendMessage(
          {
            // No key → the service worker scans on our servers instead.
            action: "ANALYZE_WITH_AI",
            imageBase64: capture.dataUrl,
            apiKey: res.geminiApiKey || null,
            streamContext: { title: streamTitle }
          },
          (aiRes) => {
            if (aiRes?.success && aiRes.data) renderScanResults(aiRes.data);
            else showScanError(aiRes?.error || "Analysis failed.");
          }
        );
      });
    });
  });
}

function loadInitialData() {
  chrome.storage.local.get(
    ["latestScanResults", "discoveredCatalog", "cartItems", "analytics", "affiliateTag"],
    (res = {}) => {
      if (res.affiliateTag) state.affiliateTag = res.affiliateTag;
      state.catalog = res.discoveredCatalog || [];
      state.cart = res.cartItems || [];

      if (res.latestScanResults) renderScanResults(res.latestScanResults, false);
      renderCatalog();
      renderCart(state.cart);
      renderAnalytics(res.analytics);
    }
  );
}

// ---------------------------------------------------------------------------
// Live scan rendering
// ---------------------------------------------------------------------------

function mergeSessionItems(targetList, incomingList) {
  for (const item of incomingList) {
    const normTitle = String(item.title || item.detectionLabel || "").toLowerCase().trim();
    if (!normTitle) continue;

    const existingIdx = targetList.findIndex(
      (p) =>
        (item.asin && p.asin && p.asin === item.asin) ||
        String(p.title || p.detectionLabel || "").toLowerCase().trim() === normTitle
    );

    if (existingIdx >= 0) {
      const existing = targetList[existingIdx];
      const updated = {
        ...existing,
        ...item,
        sourceCrop: item.sourceCrop || item.thumbnail || existing.sourceCrop,
        image: item.image || existing.image,
        price: item.price !== null && item.price !== undefined ? item.price : existing.price,
        originalPrice: item.originalPrice || existing.originalPrice,
        discountPercent: item.discountPercent || existing.discountPercent,
        dealBadge: item.dealBadge || existing.dealBadge,
        sightingCount: (existing.sightingCount || 1) + 1,
        confidence: item.confidence ?? existing.confidence
      };
      targetList.splice(existingIdx, 1);
      targetList.unshift(updated);
    } else {
      targetList.unshift({ ...item, sightingCount: 1 });
    }
  }
  return targetList.slice(0, 30);
}

function renderScanResults(data, isIncremental = true) {
  if (!data?.items) return;
  state.scan = data;

  show("scan-empty-state", false);
  show("scan-loading-state", false);
  show("scan-error-state", false);
  show("scan-results-container", true);

  const liveProgressBar = byId("scan-live-progress");
  if (liveProgressBar) liveProgressBar.style.display = "none";

  const incomingExact = data.items.exactMatches || [];
  const incomingLookAlikes = data.items.lookAlikes || [];

  if (isIncremental) {
    liveSessionFeed.exactMatches = mergeSessionItems(liveSessionFeed.exactMatches, incomingExact);
    liveSessionFeed.lookAlikes = mergeSessionItems(liveSessionFeed.lookAlikes, incomingLookAlikes);
  } else {
    liveSessionFeed.exactMatches = [...incomingExact];
    liveSessionFeed.lookAlikes = [...incomingLookAlikes];
  }

  const exactMatches = liveSessionFeed.exactMatches;
  const lookAlikes = liveSessionFeed.lookAlikes;
  const total = exactMatches.length + lookAlikes.length;

  const countBadge = byId("scanned-count");
  if (countBadge) countBadge.textContent = total;

  const streamTag = byId("stream-name-tag");
  if (streamTag) {
    const label = truncate(String(data.streamType || "Live Stream").replace(/^🔴\s*/, ""), 32);
    streamTag.textContent = data.fromCache ? `🔴 ${label} · cached` : `🔴 ${label}`;
  }

  const cropBox = byId("crop-preview-box");
  const cropImg = byId("crop-preview-img");
  if (data.croppedThumbnail && cropBox && cropImg) {
    cropImg.src = data.croppedThumbnail;
    cropBox.style.display = "block";
  } else if (cropBox) {
    cropBox.style.display = "none";
  }

  const hidden = data.filteredCount || 0;
  const threshold = data.minConfidence;

  const emptyExact = hidden
    ? `${hidden} item${hidden === 1 ? "" : "s"} found but hidden — scored below your ${threshold}% confidence setting.`
    : "No exact matches in live feed yet. Try Snip Box on one specific object.";

  renderList("exact-matches-list", exactMatches, emptyExact);
  renderList("lookalikes-list", lookAlikes, "No look-alike suggestions yet.");

  const notice = byId("filter-notice");
  if (notice) {
    if (hidden && total === 0) {
      notice.textContent = `⚠️ Confidence filter is set to ${threshold}%. ${hidden} detection${hidden === 1 ? " was" : "s were"} discarded.`;
      notice.style.display = "block";
    } else if (hidden) {
      notice.textContent = `${hidden} lower-confidence item${hidden === 1 ? "" : "s"} hidden by your ${threshold}% setting.`;
      notice.style.display = "block";
    } else {
      notice.style.display = "none";
    }
  }

  applyTierFilter();
}

function renderList(containerId, items, emptyMessage) {
  const container = byId(containerId);
  if (!container) return;
  container.replaceChildren();

  if (!items.length) {
    const empty = el("div", "empty-state-mini", emptyMessage);
    empty.style.cssText = "font-size:11px;color:#9CA3AF;padding:8px 0;";
    container.appendChild(empty);
    return;
  }

  items.forEach((prod) => container.appendChild(createProductCard(prod)));
}

// ---------------------------------------------------------------------------
// Catalog rendering
// ---------------------------------------------------------------------------

function renderCatalog() {
  const countBadge = byId("catalog-count");
  if (countBadge) countBadge.textContent = state.signedIn ? String(state.catalog.length) : "0";
  if (!state.signedIn) return;

  let filtered = state.catalog;

  if (state.categoryFilter !== "all") {
    const allowed = CATEGORY_ALIASES[state.categoryFilter] || [state.categoryFilter];
    filtered = filtered.filter((item) => allowed.includes(String(item.category || "").toLowerCase()));
  }

  if (state.searchQuery) {
    const q = state.searchQuery;
    filtered = filtered.filter((item) =>
      [item.title, item.category, item.streamTitle]
        .some((field) => String(field || "").toLowerCase().includes(q))
    );
  }

  const summary = byId("catalog-summary-text");
  if (summary) {
    const priced = state.catalog.filter((i) => typeof i.price === "number");
    const total = priced.reduce((sum, i) => sum + i.price, 0);
    summary.textContent = priced.length
      ? `${state.catalog.length} products • $${total.toFixed(2)} across ${priced.length} priced`
      : `${state.catalog.length} products saved`;
  }

  const list = byId("catalog-cards-list");
  if (!list) return;
  list.replaceChildren();

  if (!filtered.length) {
    show("catalog-empty-state", true);
    return;
  }

  show("catalog-empty-state", false);
  filtered.forEach((prod) => list.appendChild(createProductCard(prod, { catalog: true })));
}

// ---------------------------------------------------------------------------
// Product card rendering
// ---------------------------------------------------------------------------

function placeholderThumbnail(prod) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="pbg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#182030"/>
        <stop offset="100%" stop-color="#0B0F19"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="10" fill="url(#pbg)" stroke="rgba(255,153,0,0.25)" stroke-width="1.5"/>
    <circle cx="60" cy="50" r="22" fill="rgba(255,153,0,0.12)"/>
    <path d="M50 44h20v14a4 4 0 0 1-4 4H54a4 4 0 0 1-4-4V44z M56 44v-3a4 4 0 0 1 8 0v3" fill="none" stroke="#FF9900" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="60" y="88" font-size="10" font-weight="700" fill="#94A3B8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" text-anchor="middle">Live Match</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function showToast(container, message) {
  const existing = document.querySelector(".streamsnap-sidepanel-toast");
  if (existing) existing.remove();

  const toast = el("div", "streamsnap-sidepanel-toast", message);
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translate(-50%, 15px)";
    setTimeout(() => toast.remove(), 350);
  }, 2400);
}

function createProductCard(prod, { catalog = false } = {}) {
  const card = el("div", "product-card");
  const title = prod.title || "Detected item";
  const verified = Boolean(prod.verified) && isVerifiedAsin(prod.asin);
  const fallback = placeholderThumbnail(prod);

  // Check if we have a real distinct product catalog image
  const hasRealCatalogImage = Boolean(
    prod.image &&
    typeof prod.image === "string" &&
    (prod.image.startsWith("http://") || prod.image.startsWith("https://")) &&
    prod.image !== prod.sourceCrop &&
    prod.image !== prod.thumbnail
  );

  const liveSrc =
    prod.sourceCrop ||
    prod.thumbnail ||
    prod.croppedThumbnail ||
    state.scan?.croppedThumbnail ||
    state.scan?.frameSnapshot ||
    (hasRealCatalogImage ? prod.image : fallback);

  let thumbElement;

  // If a distinct catalog photo exists, show dual comparison. Otherwise show the crisp live camera crop.
  if (hasRealCatalogImage && liveSrc && liveSrc !== prod.image) {
    const dualThumbs = el("div", "product-dual-thumbs");

    // 1. Live Video Frame Crop
    const liveBox = el("div", "thumb-box thumb-box-live");
    liveBox.title = "Live camera crop from stream (Click for full frame)";
    const liveTag = el("span", "thumb-badge thumb-badge-live");
    liveTag.append(createSvgIcon("camera", 10), el("span", null, "Live"));
    const liveImg = document.createElement("img");
    liveImg.src = liveSrc;
    liveImg.alt = "Live Capture";
    liveImg.loading = "lazy";
    liveImg.referrerPolicy = "no-referrer";
    liveImg.addEventListener("error", () => {
      liveImg.src = fallback;
    });
    liveBox.append(liveTag, liveImg);
    liveBox.addEventListener("click", (e) => {
      e.stopPropagation();
      openSourceFrameModal(prod);
    });

    // Visual match arrow
    const matchArrow = el("div", "thumb-match-arrow", "➔");

    // 2. Catalog Matched Product Image
    const catalogBox = el("div", "thumb-box thumb-box-catalog");
    catalogBox.title = "Amazon Product Listing (Click to view)";
    const catalogTag = el("span", "thumb-badge thumb-badge-catalog");
    catalogTag.append(createSvgIcon(verified ? "bag" : "target", 10), el("span", null, verified ? "Amazon" : "Match"));
    const catalogImg = document.createElement("img");
    catalogImg.src = prod.image;
    catalogImg.alt = title;
    catalogImg.loading = "lazy";
    catalogImg.referrerPolicy = "no-referrer";
    catalogImg.addEventListener("error", () => {
      catalogImg.src = fallback;
    });
    catalogBox.append(catalogTag, catalogImg);
    catalogBox.addEventListener("click", (e) => {
      e.stopPropagation();
      if (verified && prod.asin) {
        window.open(getAmazonProductUrl(prod.asin, title, state.affiliateTag), "_blank");
      } else {
        window.open(getWebSearchUrl(title), "_blank");
      }
    });

    dualThumbs.append(liveBox, matchArrow, catalogBox);
    thumbElement = dualThumbs;
  } else {
    // Single high-resolution live stream crop thumbnail
    const singleThumb = el("div", "product-thumb product-single-thumb");
    singleThumb.title = "Live visual crop (Click to view full video frame)";

    const cropBadge = el("span", "thumb-badge " + (verified ? "thumb-badge-catalog" : "thumb-badge-live"));
    cropBadge.append(createSvgIcon(verified ? "bag" : "camera", 10), el("span", null, verified ? "Amazon" : "Live Crop"));

    const singleImg = document.createElement("img");
    singleImg.src = liveSrc;
    singleImg.alt = title;
    singleImg.loading = "lazy";
    singleImg.referrerPolicy = "no-referrer";
    singleImg.addEventListener("error", () => {
      singleImg.src = fallback;
    });

    singleThumb.append(cropBadge, singleImg);
    singleThumb.addEventListener("click", (e) => {
      e.stopPropagation();
      openSourceFrameModal(prod);
    });

    thumbElement = singleThumb;
  }

  // --- details ---
  const details = el("div", "product-details");
  const top = el("div");

  const titleNode = el("div", "product-title", title);
  titleNode.title = title;
  top.appendChild(titleNode);

  const metaRow = el("div", "product-meta-row");
  const price = formatPrice(prod.price);
  if (price) {
    metaRow.appendChild(el("span", "product-price", price));

    if (prod.originalPrice && prod.originalPrice > prod.price) {
      const orig = formatPrice(prod.originalPrice);
      if (orig) {
        const origSpan = el("span", "product-original-price", orig);
        origSpan.title = "Original List Price";
        metaRow.appendChild(origSpan);
      }
    }

    if (prod.discountPercent && prod.discountPercent > 0) {
      const disc = el("span", "product-discount-badge", `${Math.round(prod.discountPercent)}% OFF`);
      metaRow.appendChild(disc);
    }
  } else {
    metaRow.appendChild(el("span", "product-price-unpriced", "Price on Amazon"));
  }

  // Verification status pill
  const statusPill = el(
    "span",
    verified ? "verification-pill verified" : "verification-pill unverified",
    verified ? "Verified listing" : "Visual match"
  );
  statusPill.title = verified
    ? "Confirmed Amazon product page"
    : "Visual match — leads to a filtered search";
  metaRow.appendChild(statusPill);

  if (typeof prod.confidence === "number" && prod.confidence > 0) {
    const conf = el(
      "span",
      "confidence-pill",
      `${Math.round(prod.confidence * 100)}% confidence`
    );
    metaRow.appendChild(conf);
  }

  if (prod.dealBadge && !prod.discountPercent) {
    const deal = el("span", "product-deal-badge", prod.dealBadge);
    metaRow.appendChild(deal);
  }

  top.appendChild(metaRow);

  if (prod.matchReason) {
    const reason = el("div", "product-match-reason", prod.matchReason);
    reason.title = prod.matchReason;
    top.appendChild(reason);
  }

  // --- actions ---
  const actionsWrap = el("div", "product-actions-wrap");

  // Row 1: Primary Action Buttons
  const primaryRow = el("div", "product-actions-primary");

  // 1. Hero 1-Click Buy / Amazon Button (Main CTA)
  const buyBtn = el("button", "buy-hero-btn");
  buyBtn.title = verified ? "1-Click Buy on Amazon (Prime)" : "Search & Buy on Amazon";
  buyBtn.append(createSvgIcon("zap", 12), el("span", null, verified ? "1-Click Buy" : "Buy on Amazon"));
  buyBtn.addEventListener("click", () => {
    handleDirectBuy(prod, buyBtn);
    setTimeout(() => {
      if (verified && prod.asin) {
        window.open(getAmazonProductUrl(prod.asin, title, state.affiliateTag), "_blank");
      } else {
        window.open(getAmazonSearchUrl(title, state.affiliateTag), "_blank");
      }
    }, 450);
  });
  primaryRow.appendChild(buyBtn);

  // 2. Add to Cart (StreamSnap Remote Cart)
  const addCartBtn = el("button", "cart-secondary-btn");
  addCartBtn.title = "Add to StreamSnap Cart";
  addCartBtn.append(createSvgIcon("cart", 12), el("span", null, "+ Cart"));
  addCartBtn.addEventListener("click", () => addToCart(prod, addCartBtn));
  primaryRow.appendChild(addCartBtn);

  // 3. Inspect Live Video Crop Frame
  const frameBtn = el("button", "view-btn source-frame-btn");
  frameBtn.title = "Inspect video crop & visual match";
  frameBtn.append(createSvgIcon("camera", 11), el("span", null, "Crop"));
  frameBtn.addEventListener("click", () => openSourceFrameModal(prod));
  primaryRow.appendChild(frameBtn);

  // 4. If in Catalog / History: Delete button
  if (catalog) {
    const delBtn = el("button", "view-btn delete-btn");
    delBtn.title = "Remove from history";
    delBtn.style.color = "#EF4444";
    delBtn.append(createSvgIcon("trash", 12));
    delBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "DELETE_CATALOG_ITEM", id: prod.id });
    });
    primaryRow.appendChild(delBtn);
  }

  actionsWrap.appendChild(primaryRow);

  // Row 2: Clean, Readable Store Comparison Pills
  const compareRow = el("div", "product-compare-row");
  const compareLabel = el("span", "compare-label", "Compare:");
  compareRow.appendChild(compareLabel);

  const stores = getAllStoreSearchUrls(title);
  stores.forEach(store => {
    const storeLink = el("a", `compare-pill compare-pill-${store.id}`);
    storeLink.href = store.url;
    storeLink.target = "_blank";
    storeLink.rel = "noopener noreferrer";
    storeLink.title = `Search "${title}" on ${store.label}`;
    storeLink.textContent = store.label;
    compareRow.appendChild(storeLink);
  });

  actionsWrap.appendChild(compareRow);

  details.append(top, actionsWrap);
  card.append(thumbElement, details);
  return card;
}

function handleDirectBuy(prod, buttonEl) {
  const original = buttonEl.innerHTML;
  buttonEl.textContent = "Opening…";
  buttonEl.style.background = "#10B981";

  // Add to cart automatically
  chrome.runtime.sendMessage({
    action: "ADD_TO_CART",
    product: {
      asin: prod.asin,
      title: prod.title,
      price: typeof prod.price === "number" ? prod.price : null,
      image: prod.image || prod.thumbnail || null,
      category: prod.category
    }
  });

  setTimeout(() => {
    buttonEl.replaceChildren(createSvgIcon("check", 12), document.createTextNode(" Ready!"));
    showToast(
      document.body,
      `1-Click Buy: "${truncate(prod.title, 26)}" added to cart & checkout initiated!`
    );
    setTimeout(() => {
      buttonEl.innerHTML = original;
      buttonEl.style.background = "";
    }, 2200);
  }, 400);
}

function addToCart(prod, buttonEl) {
  const original = buttonEl.innerHTML;
  buttonEl.replaceChildren(createSvgIcon("check", 12), document.createTextNode(" Added"));
  buttonEl.style.background = "#10B981";

  chrome.runtime.sendMessage(
    {
      action: "ADD_TO_CART",
      product: {
        asin: prod.asin,
        title: prod.title,
        price: typeof prod.price === "number" ? prod.price : null,
        image: prod.image || prod.thumbnail || null,
        category: prod.category
      }
    },
    (res) => {
      if (res?.cartItems) renderCart(res.cartItems);
      showToast(document.body, `"${truncate(prod.title, 26)}" added to cart!`);
      setTimeout(() => {
        buttonEl.innerHTML = original;
        buttonEl.style.background = "";
      }, 1800);
    }
  );
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

function renderCart(items) {
  state.cart = items || [];

  const countBadge = byId("cart-count");
  if (countBadge) {
    countBadge.textContent = state.signedIn ? String(state.cart.reduce((sum, i) => sum + (i.quantity || 1), 0)) : "0";
  }
  if (!state.signedIn) return;

  if (!state.cart.length) {
    show("cart-empty-state", true);
    show("cart-content-view", false);
    return;
  }

  show("cart-empty-state", false);
  show("cart-content-view", true);

  const list = byId("cart-items-list");
  if (!list) return;
  list.replaceChildren();

  let subtotal = 0;
  let hasUnpriced = false;

  state.cart.forEach((item) => {
    const quantity = item.quantity || 1;
    if (typeof item.price === "number") subtotal += item.price * quantity;
    else hasUnpriced = true;

    const row = el("div", "product-card");
    row.style.marginBottom = "8px";

    const thumb = el("div", "product-thumb");
    thumb.style.cssText = "width:50px;height:50px;";
    const img = document.createElement("img");
    img.src = item.image || placeholderThumbnail(item);
    img.alt = item.title || "Cart item";
    img.addEventListener("error", () => {
      img.src = placeholderThumbnail(item);
    });
    thumb.appendChild(img);

    const details = el("div", "product-details");
    details.appendChild(el("div", "product-title", item.title || "Item"));

    const meta = el("div", "product-meta-row");
    meta.appendChild(
      el("span", "product-price", formatPrice(item.price) || "Price on Amazon")
    );
    const qty = el("span", null, `Qty: ${quantity}`);
    qty.style.cssText = "font-size:11px;color:#9CA3AF;";
    meta.appendChild(qty);

    const remove = el("button", "view-btn delete-btn");
    remove.title = "Remove from cart";
    remove.style.color = "#EF4444";
    remove.append(createSvgIcon("trash", 12));
    remove.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        action: "REMOVE_CART_ITEM",
        title: item.title,
        asin: item.asin
      });
    });
    meta.appendChild(remove);

    details.appendChild(meta);
    row.append(thumb, details);
    list.appendChild(row);
  });

  const subtotalEl = byId("cart-subtotal");
  if (subtotalEl) {
    subtotalEl.textContent = hasUnpriced
      ? `$${subtotal.toFixed(2)}+`
      : `$${subtotal.toFixed(2)}`;
  }

  // Previously only the first item was sent to Amazon. Send the whole cart.
  const checkoutBtn = byId("amazon-checkout-btn");
  if (checkoutBtn) {
    checkoutBtn.href = getAmazonCartUrl(state.cart, state.affiliateTag);
    checkoutBtn.rel = "noopener noreferrer";
  }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

function renderAnalytics(data) {
  if (!state.signedIn) {
    const set = (id, value) => {
      const node = byId(id);
      if (node) node.textContent = value;
    };
    set("metric-scans", 0);
    set("metric-clicks", 0);
    set("metric-cart", 0);
    set("metric-earnings", "$0.00");
    return;
  }

  chrome.storage.local.get(["analytics", "affiliateTag"], (res = {}) => {
    const analytics = data ||
      res.analytics || { totalScans: 0, amazonClicks: 0, cartAdds: 0, estimatedEarnings: 0 };

    const set = (id, value) => {
      const node = byId(id);
      if (node) node.textContent = value;
    };

    set("metric-scans", analytics.totalScans || 0);
    set("metric-clicks", analytics.amazonClicks || 0);
    set("metric-cart", analytics.cartAdds || 0);
    set("metric-earnings", `$${Number(analytics.estimatedEarnings || 0).toFixed(2)}`);
    set("active-tag-label", res.affiliateTag || state.affiliateTag);
  });
}
