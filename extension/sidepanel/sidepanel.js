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
  getWebSearchUrl,
  isVerifiedAsin
} from "../services/amazon_service.js";

const state = {
  scan: null,
  catalog: [],
  cart: [],
  categoryFilter: "all",
  searchQuery: "",
  tierFilter: "all",
  affiliateTag: "streamsnap-20"
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
  initCatalogFilters();
  initModal();
  loadInitialData();
});

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
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
    if (!keyStatus) return;
    keyStatus.textContent = hasKey
      ? "Key saved — Gemini Vision active"
      : "No API key. Scanning is disabled until you add one.";
    keyStatus.style.color = hasKey ? "#10B981" : "#F59E0B";
  }

  chrome.storage.local.get(
    ["geminiApiKey", "autoScanIntervalSec", "minConfidence", "affiliateTag"],
    (res = {}) => {
      if (keyInput && res.geminiApiKey) keyInput.value = res.geminiApiKey;
      paintKeyStatus(Boolean(res.geminiApiKey));

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
    const tag = raw || "streamsnap-20";
    state.affiliateTag = tag;
    chrome.storage.local.set({ affiliateTag: tag }, () => {
      const label = byId("active-tag-label");
      if (label) label.textContent = tag;
      flashSaved(saveTagBtn);
      renderCatalog();
    });
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

function openSourceFrameModal(prod) {
  const modal = byId("source-frame-modal");
  const sourceImg = byId("modal-source-img");
  const prodImg = byId("modal-product-img");

  const fallback = placeholderThumbnail(prod);
  const sourceSrc =
    prod.sourceCrop || prod.thumbnail || state.scan?.croppedThumbnail || state.scan?.frameSnapshot || fallback;

  sourceImg.src = sourceSrc;
  sourceImg.onerror = () => {
    sourceImg.src = fallback;
  };

  prodImg.src = prod.image || fallback;
  prodImg.onerror = () => {
    prodImg.src = fallback;
  };

  byId("modal-stream-name").textContent =
    prod.streamTitle || prod.lastStream || state.scan?.streamType || "Live Stream";
  byId("modal-product-title").textContent = prod.title || "Detected item";
  byId("modal-product-price").textContent = formatPrice(prod.price) || "Price not confirmed";
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
    if (changes.latestScanResults?.newValue) renderScanResults(changes.latestScanResults.newValue);
    if (changes.discoveredCatalog) {
      state.catalog = changes.discoveredCatalog.newValue || [];
      renderCatalog();
    }
    if (changes.cartItems) renderCart(changes.cartItems.newValue || []);
    if (changes.analytics?.newValue) renderAnalytics(changes.analytics.newValue);
  });

  chrome.runtime.onMessage.addListener((message) => {
    switch (message.action) {
      case "SCAN_RESULTS_UPDATED":
        renderScanResults(message.data);
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
    }
  });

  byId("direct-scan-btn")?.addEventListener("click", triggerDirectScan);
  byId("radar-scan-trigger")?.addEventListener("click", triggerDirectScan);
  byId("rescan-btn")?.addEventListener("click", triggerDirectScan);
  byId("retry-scan-btn")?.addEventListener("click", triggerDirectScan);

  byId("clear-cart-btn")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "CLEAR_CART" });
  });
}

function showScanningState() {
  show("scan-empty-state", false);
  show("scan-error-state", false);
  show("scan-results-container", false);
  show("scan-loading-state", true);
}

function showScanError(message) {
  show("scan-loading-state", false);
  show("scan-results-container", false);
  show("scan-empty-state", false);
  const text = byId("scan-error-text");
  if (text) text.textContent = message || "The scan could not be completed.";
  show("scan-error-state", true);
}

function triggerDirectScan() {
  showScanningState();

  chrome.storage.local.get(["geminiApiKey"], (res = {}) => {
    if (!res.geminiApiKey) {
      showScanError("Add your Gemini API key in the Setup tab to start scanning.");
      return;
    }

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
            action: "ANALYZE_WITH_AI",
            imageBase64: capture.dataUrl,
            apiKey: res.geminiApiKey,
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

      if (res.latestScanResults) renderScanResults(res.latestScanResults);
      renderCatalog();
      renderCart(state.cart);
      renderAnalytics(res.analytics);
    }
  );
}

// ---------------------------------------------------------------------------
// Live scan rendering
// ---------------------------------------------------------------------------

function renderScanResults(data) {
  if (!data?.items) return;
  state.scan = data;

  show("scan-empty-state", false);
  show("scan-loading-state", false);
  show("scan-error-state", false);
  show("scan-results-container", true);

  const { exactMatches = [], lookAlikes = [] } = data.items;
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

  renderList("exact-matches-list", exactMatches, "No high-confidence matches in this frame.");
  renderList("lookalikes-list", lookAlikes, "No look-alike suggestions for this frame.");

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
  if (countBadge) countBadge.textContent = state.catalog.length;

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
// Product card
// ---------------------------------------------------------------------------

function placeholderThumbnail(prod) {
  const title = String(prod.title || prod.detectionLabel || "").toLowerCase();
  const table = [
    [["plate", "weight", "dumbbell", "gym", "fitness"], "🏋️", "#2563EB", "Gym & Fitness"],
    [["costume", "bodysuit", "cosplay"], "🦸", "#DC2626", "Cosplay"],
    [["hoodie", "jacket", "shirt", "streetwear"], "👕", "#10B981", "Streetwear"],
    [["mic", "microphone", "shure"], "🎙️", "#6366F1", "Audio"],
    [["headphone", "airpods", "sony"], "🎧", "#8B5CF6", "Headphones"],
    [["light", "govee", "elgato"], "💡", "#F59E0B", "Lighting"],
    [["cup", "tumbler", "stanley", "bottle"], "🥤", "#EC4899", "Drinkware"],
    [["deck", "controller", "keyboard"], "🎮", "#14B8A6", "Gaming"]
  ];

  let [icon, bg, label] = ["🛍️", "#FF9900", prod.category || "Detected item"];
  for (const [keywords, i, b, l] of table) {
    if (keywords.some((k) => title.includes(k))) {
      [icon, bg, label] = [i, b, l];
      break;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <rect width="120" height="120" rx="16" fill="#131924" stroke="${bg}" stroke-width="2"/>
    <circle cx="60" cy="46" r="28" fill="${bg}" opacity="0.25"/>
    <text x="60" y="55" font-size="32" text-anchor="middle" dominant-baseline="middle">${icon}</text>
    <text x="60" y="96" font-size="9" font-weight="bold" fill="#F3F4F6" font-family="sans-serif" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createProductCard(prod, { catalog = false } = {}) {
  const card = el("div", "product-card");
  const title = prod.title || "Detected item";
  const verified = Boolean(prod.verified) && isVerifiedAsin(prod.asin);
  const fallback = placeholderThumbnail(prod);

  // --- thumbnail ---
  const thumb = el("div", "product-thumb");
  const img = document.createElement("img");
  img.src = prod.image || prod.thumbnail || prod.sourceCrop || fallback;
  img.alt = title;
  img.referrerPolicy = "no-referrer";
  img.loading = "lazy";
  img.addEventListener("error", () => {
    img.src = fallback;
  });
  thumb.appendChild(img);

  // --- details ---
  const details = el("div", "product-details");
  const top = el("div");

  const titleNode = el("div", "product-title", title);
  titleNode.title = title;
  top.appendChild(titleNode);

  const metaRow = el("div", "product-meta-row");
  const price = formatPrice(prod.price);
  metaRow.appendChild(
    price ? el("span", "product-price", price) : el("span", "product-price-unknown", "Price on Amazon")
  );

  if (verified) {
    metaRow.appendChild(el("span", "product-verified", "✓ Verified listing"));
  } else {
    const pill = el("span", "product-unverified", "Visual match");
    pill.title = "Identified from the video. Opens an Amazon search rather than a specific listing.";
    metaRow.appendChild(pill);
  }

  if (catalog) {
    metaRow.appendChild(el("span", "catalog-seen-tag", `Seen ${prod.sightingCount || 1}×`));
  } else if (typeof prod.confidence === "number" && prod.confidence > 0) {
    metaRow.appendChild(el("span", "product-confidence", `${prod.confidence}% confidence`));
  }
  top.appendChild(metaRow);

  const desc = catalog
    ? `${prod.category || "Gear"} • ${truncate(prod.streamTitle || "Stream", 24)}`
    : prod.matchReason || prod.detectionLabel || "Detected in the live stream";
  top.appendChild(el("div", "product-match-desc", desc));

  // --- actions ---
  const actions = el("div", "card-actions");

  const frameBtn = el("button", "source-frame-btn");
  frameBtn.title = "View the video frame this came from";
  frameBtn.appendChild(el("span", null, "📸 Frame"));
  frameBtn.addEventListener("click", () => openSourceFrameModal(prod));
  actions.appendChild(frameBtn);

  if (verified) {
    const addBtn = el("button", "add-cart-btn");
    addBtn.appendChild(el("span", null, "🛒 Add"));
    addBtn.addEventListener("click", () => addToCart(prod, addBtn));
    actions.appendChild(addBtn);
  }

  const amazonLink = el("a", "view-btn amazon-link");
  amazonLink.href = getAmazonProductUrl(prod.asin, title, state.affiliateTag);
  amazonLink.target = "_blank";
  amazonLink.rel = "noopener noreferrer";
  amazonLink.title = verified ? "Open this listing on Amazon" : "Search Amazon for this item";
  amazonLink.appendChild(el("span", null, verified ? "Amazon ↗" : "Search ↗"));
  amazonLink.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "TRACK_AMAZON_CLICK" });
  });
  actions.appendChild(amazonLink);

  const webLink = el("a", "view-btn web-search-link");
  webLink.href = getWebSearchUrl(title);
  webLink.target = "_blank";
  webLink.rel = "noopener noreferrer";
  webLink.title = "Compare prices on Google Shopping";
  webLink.appendChild(el("span", null, "🌐 Web"));
  actions.appendChild(webLink);

  if (catalog) {
    const delBtn = el("button", "view-btn delete-btn");
    delBtn.title = "Remove from history";
    delBtn.style.color = "#EF4444";
    delBtn.appendChild(el("span", null, "✕"));
    delBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "DELETE_CATALOG_ITEM", id: prod.id });
    });
    actions.appendChild(delBtn);
  }

  details.append(top, actions);
  card.append(thumb, details);
  return card;
}

function addToCart(prod, buttonEl) {
  const original = buttonEl.textContent;
  buttonEl.textContent = "✓ Added";
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
    }
  );

  setTimeout(() => {
    buttonEl.textContent = original;
    buttonEl.style.background = "";
  }, 1800);
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

function renderCart(items) {
  state.cart = items || [];

  const countBadge = byId("cart-count");
  if (countBadge) {
    countBadge.textContent = state.cart.reduce((sum, i) => sum + (i.quantity || 1), 0);
  }

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

    const remove = el("button", "view-btn delete-btn", "✕");
    remove.title = "Remove from cart";
    remove.style.color = "#EF4444";
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
