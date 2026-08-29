/**
 * StreamSnap AI — Production Side Panel Controller (UI/UX Pro Max)
 */

import { getAmazonCartUrl, getAmazonProductUrl } from "../services/amazon_service.js";

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initListeners();
  initSettings();
  initCatalogFilters();
  initModal();
  loadInitialData();
});

let currentScanData = null;
let currentCatalog = [];
let currentCart = [];
let currentFilterCategory = "all";
let currentSearchQuery = "";
let liveActiveFilter = "all";
let userAffiliateTag = "streamsnap-20";

function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.remove("active"));

      btn.classList.add("active");
      const targetId = `tab-${btn.dataset.tab}`;
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");

      if (btn.dataset.tab === "catalog") {
        renderCatalog();
      } else if (btn.dataset.tab === "analytics") {
        renderAnalytics();
      }
    });
  });
}

function initSettings() {
  const keyInput = document.getElementById("gemini-api-key-input");
  const saveKeyBtn = document.getElementById("save-api-key-btn");
  const keyStatus = document.getElementById("api-key-status");
  const autoScanSelect = document.getElementById("auto-scan-select");
  const confSlider = document.getElementById("confidence-slider");
  const confVal = document.getElementById("confidence-val");
  const tagInput = document.getElementById("affiliate-tag-input");
  const saveTagBtn = document.getElementById("save-tag-btn");

  // Load existing settings
  chrome.storage.local.get(["geminiApiKey", "autoScanIntervalSec", "minConfidence", "affiliateTag"], (res) => {
    if (res) {
      if (res.geminiApiKey) {
        keyInput.value = res.geminiApiKey;
        keyStatus.textContent = "Active: Gemini 2.5 Flash ⚡";
        keyStatus.style.color = "#10B981";
      }
      if (res.autoScanIntervalSec !== undefined) {
        autoScanSelect.value = res.autoScanIntervalSec.toString();
      }
      if (res.minConfidence !== undefined) {
        confSlider.value = res.minConfidence;
        confVal.textContent = `${res.minConfidence}%`;
      }
      if (res.affiliateTag) {
        tagInput.value = res.affiliateTag;
        userAffiliateTag = res.affiliateTag;
        document.getElementById("active-tag-label").textContent = res.affiliateTag;
      }
    }
  });

  // Save Gemini Key
  saveKeyBtn.addEventListener("click", () => {
    const key = keyInput.value.trim();
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      saveKeyBtn.textContent = "Saved ✓";
      saveKeyBtn.style.background = "#10B981";
      keyStatus.textContent = key ? "Active: Gemini 2.5 Flash ⚡" : "Mode: Contextual Catalog";
      keyStatus.style.color = key ? "#10B981" : "#9CA3AF";
      setTimeout(() => {
        saveKeyBtn.textContent = "Save";
        saveKeyBtn.style.background = "";
      }, 1500);
    });
  });

  // Auto-scan change
  autoScanSelect.addEventListener("change", () => {
    const interval = parseInt(autoScanSelect.value, 10);
    chrome.storage.local.set({ autoScanIntervalSec: interval });
  });

  // Confidence slider
  confSlider.addEventListener("input", () => {
    confVal.textContent = `${confSlider.value}%`;
  });
  confSlider.addEventListener("change", () => {
    chrome.storage.local.set({ minConfidence: parseInt(confSlider.value, 10) });
  });

  // Save Affiliate Tag
  saveTagBtn.addEventListener("click", () => {
    const tag = tagInput.value.trim() || "streamsnap-20";
    userAffiliateTag = tag;
    chrome.storage.local.set({ affiliateTag: tag }, () => {
      saveTagBtn.textContent = "Saved ✓";
      saveTagBtn.style.background = "#10B981";
      document.getElementById("active-tag-label").textContent = tag;
      setTimeout(() => {
        saveTagBtn.textContent = "Save";
        saveTagBtn.style.background = "";
      }, 1500);
    });
  });
}

function initCatalogFilters() {
  // Category Pills
  const catPills = document.querySelectorAll("#catalog-category-pills .filter-pill");
  catPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      catPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentFilterCategory = pill.dataset.cat;
      renderCatalog();
    });
  });

  // Search Input
  const searchInput = document.getElementById("catalog-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearchQuery = e.target.value.toLowerCase().trim();
      renderCatalog();
    });
  }

  // Clear Catalog
  const clearBtn = document.getElementById("clear-catalog-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to clear your persistent product catalog?")) {
        chrome.runtime.sendMessage({ action: "CLEAR_CATALOG" });
      }
    });
  }

  // Live Filter Pills
  const livePills = document.querySelectorAll("#live-filter-pills .filter-pill");
  livePills.forEach((pill) => {
    pill.addEventListener("click", () => {
      livePills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      liveActiveFilter = pill.dataset.filter;
      applyLiveFilter();
    });
  });
}

function applyLiveFilter() {
  const tier1 = document.getElementById("tier1-section");
  const tier2 = document.getElementById("tier2-section");
  if (!tier1 || !tier2) return;

  if (liveActiveFilter === "all") {
    tier1.style.display = "block";
    tier2.style.display = "block";
  } else if (liveActiveFilter === "exact") {
    tier1.style.display = "block";
    tier2.style.display = "none";
  } else if (liveActiveFilter === "lookalike") {
    tier1.style.display = "none";
    tier2.style.display = "block";
  }
}

function initModal() {
  const modal = document.getElementById("source-frame-modal");
  const closeBtn = document.getElementById("close-modal-btn");

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });
}

function openSourceFrameModal(prod) {
  const modal = document.getElementById("source-frame-modal");
  const sourceImg = document.getElementById("modal-source-img");
  const prodImg = document.getElementById("modal-product-img");
  const streamTag = document.getElementById("modal-stream-name");
  const prodTitle = document.getElementById("modal-product-title");
  const prodPrice = document.getElementById("modal-product-price");

  sourceImg.src = prod.sourceCrop || prod.image || getProductThumbnail(prod);
  prodImg.src = prod.image || getProductThumbnail(prod);
  streamTag.textContent = prod.streamTitle || prod.lastStream || "Live Stream Frame";
  prodTitle.textContent = prod.title || "Amazon Product";
  prodPrice.textContent = `$${Number(prod.price || 29.99).toFixed(2)}`;

  modal.style.display = "flex";
}

function initListeners() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.isScanning && changes.isScanning.newValue) {
        showScanningState();
      }
      if (changes.latestScanResults && changes.latestScanResults.newValue) {
        renderScanResults(changes.latestScanResults.newValue);
      }
      if (changes.discoveredCatalog && changes.discoveredCatalog.newValue) {
        currentCatalog = changes.discoveredCatalog.newValue;
        renderCatalog();
      }
      if (changes.cartItems && changes.cartItems.newValue) {
        renderCart(changes.cartItems.newValue);
      }
      if (changes.analytics && changes.analytics.newValue) {
        renderAnalytics(changes.analytics.newValue);
      }
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "SCAN_RESULTS_UPDATED") {
      renderScanResults(message.data);
    }
    if (message.action === "CATALOG_UPDATED") {
      currentCatalog = message.discoveredCatalog;
      renderCatalog();
    }
    if (message.action === "CART_UPDATED") {
      renderCart(message.cartItems);
    }
    if (message.action === "ANALYTICS_UPDATED") {
      renderAnalytics(message.analytics);
    }
  });

  // Direct Scan Button Handlers
  const directBtn = document.getElementById("direct-scan-btn");
  const radarBtn = document.getElementById("radar-scan-trigger");
  const rescanBtn = document.getElementById("rescan-btn");

  if (directBtn) directBtn.addEventListener("click", triggerDirectScan);
  if (radarBtn) radarBtn.addEventListener("click", triggerDirectScan);
  if (rescanBtn) rescanBtn.addEventListener("click", triggerDirectScan);
}

function showScanningState() {
  const emptyState = document.getElementById("scan-empty-state");
  const loadingState = document.getElementById("scan-loading-state");
  const resultsContainer = document.getElementById("scan-results-container");
  if (emptyState) emptyState.style.display = "none";
  if (resultsContainer) resultsContainer.style.display = "none";
  if (loadingState) loadingState.style.display = "block";
}

function hideScanningState() {
  const loadingState = document.getElementById("scan-loading-state");
  if (loadingState) loadingState.style.display = "none";
  if (currentScanData && currentScanData.items && (
    (currentScanData.items.exactMatches && currentScanData.items.exactMatches.length > 0) ||
    (currentScanData.items.lookAlikes && currentScanData.items.lookAlikes.length > 0)
  )) {
    const resultsContainer = document.getElementById("scan-results-container");
    if (resultsContainer) resultsContainer.style.display = "block";
  } else {
    const emptyState = document.getElementById("scan-empty-state");
    if (emptyState) emptyState.style.display = "block";
  }
}

async function triggerDirectScan() {
  showScanningState();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const streamTitle = activeTab ? activeTab.title : "Live Stream";

    chrome.runtime.sendMessage({ action: "CAPTURE_VISIBLE_TAB" }, (captureRes) => {
      const capturedImage = captureRes?.dataUrl;

      chrome.storage.local.get(["geminiApiKey"], (storageRes) => {
        const apiKey = storageRes.geminiApiKey || "";

        if (capturedImage) {

          chrome.runtime.sendMessage({
            action: "ANALYZE_WITH_AI",
            imageBase64: capturedImage,
            apiKey: apiKey,
            streamContext: { title: streamTitle }
          }, (aiRes) => {
            if (aiRes && aiRes.success && aiRes.data) {
              renderScanResults(aiRes.data);
            } else {
              hideScanningState();
            }
          });
        } else {
          hideScanningState();
        }
      });
    });
  });
}


function loadInitialData() {
  chrome.storage.local.get(["latestScanResults", "discoveredCatalog", "cartItems", "analytics", "affiliateTag"], (res) => {
    if (res) {
      if (res.latestScanResults) renderScanResults(res.latestScanResults);
      if (res.discoveredCatalog) {
        currentCatalog = res.discoveredCatalog;
        renderCatalog();
      }
      if (res.cartItems) renderCart(res.cartItems);
      if (res.analytics) renderAnalytics(res.analytics);
      if (res.affiliateTag) userAffiliateTag = res.affiliateTag;
    }
  });
}

function renderScanResults(data) {
  if (!data || !data.items) return;
  currentScanData = data;

  const emptyState = document.getElementById("scan-empty-state");
  const loadingState = document.getElementById("scan-loading-state");
  const resultsContainer = document.getElementById("scan-results-container");
  const streamTag = document.getElementById("stream-name-tag");
  const countBadge = document.getElementById("scanned-count");

  if (emptyState) emptyState.style.display = "none";
  if (loadingState) loadingState.style.display = "none";
  if (resultsContainer) resultsContainer.style.display = "block";

  const { exactMatches = [], lookAlikes = [] } = data.items;
  const totalCount = (exactMatches?.length || 0) + (lookAlikes?.length || 0);
  if (countBadge) countBadge.textContent = totalCount;

  if (streamTag) {
    const rawTitle = data.streamType ? data.streamType.replace(/^🔴\s*/, '') : 'LIVE STREAM';
    streamTag.textContent = `🔴 ${rawTitle.slice(0, 32)}${rawTitle.length > 32 ? '...' : ''}`;
  }

  const cropBox = document.getElementById("crop-preview-box");
  const cropImg = document.getElementById("crop-preview-img");
  if (data.croppedThumbnail && cropBox && cropImg) {
    cropImg.src = data.croppedThumbnail;
    cropBox.style.display = "block";
  } else if (cropBox) {
    cropBox.style.display = "none";
  }

  // Render Tier 1 (Exact Matches)
  const exactList = document.getElementById("exact-matches-list");
  if (exactList) {
    exactList.innerHTML = "";
    if (exactMatches && exactMatches.length > 0) {
      exactMatches.forEach((prod) => {
        exactList.appendChild(createProductCard(prod, "exact"));
      });
    } else {
      exactList.innerHTML = `<div class="empty-state-mini" style="font-size:11px; color:#9CA3AF; padding:8px 0;">No exact brand barcode matches in this frame.</div>`;
    }
  }

  // Render Tier 2 (Look-Alikes)
  const lookalikeList = document.getElementById("lookalikes-list");
  if (lookalikeList) {
    lookalikeList.innerHTML = "";
    if (lookAlikes && lookAlikes.length > 0) {
      lookAlikes.forEach((prod) => {
        lookalikeList.appendChild(createProductCard(prod, "lookalike"));
      });
    } else {
      lookalikeList.innerHTML = `<div class="empty-state-mini" style="font-size:11px; color:#9CA3AF; padding:8px 0;">No look-alike items needed.</div>`;
    }
  }

  applyLiveFilter();
}

/**
 * Render Persistent Deduplicated Catalog Tab
 */
function renderCatalog() {
  const catalogCountBadge = document.getElementById("catalog-count");
  const statsText = document.getElementById("catalog-stats-text");
  const emptyState = document.getElementById("catalog-empty-state");
  const list = document.getElementById("catalog-cards-list");

  if (catalogCountBadge) catalogCountBadge.textContent = currentCatalog.length;

  // Apply filters
  let filtered = currentCatalog;
  if (currentFilterCategory !== "all") {
    filtered = filtered.filter(item => (item.category || "").toLowerCase() === currentFilterCategory.toLowerCase());
  }
  if (currentSearchQuery) {
    filtered = filtered.filter(item => 
      (item.title || "").toLowerCase().includes(currentSearchQuery) ||
      (item.category || "").toLowerCase().includes(currentSearchQuery) ||
      (item.streamTitle || "").toLowerCase().includes(currentSearchQuery)
    );
  }

  if (statsText) {
    const totalVal = currentCatalog.reduce((sum, i) => sum + Number(i.price || 0), 0);
    statsText.textContent = `${currentCatalog.length} Unique Products • $${totalVal.toFixed(2)} Total Value`;
  }

  if (!list) return;

  if (filtered.length === 0) {
    list.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  list.innerHTML = "";

  filtered.forEach((prod) => {
    list.appendChild(createCatalogProductCard(prod));
  });
}

function getProductThumbnail(prod) {
  const title = (prod.title || prod.detectionLabel || "").toLowerCase();
  
  if (prod.image && prod.image.startsWith("http") && !prod.image.includes("placeholder")) {
    return prod.image;
  }
  
  let icon = "🛍️";
  let bg = "#FF9900";
  let categoryLabel = prod.category || "Amazon Item";

  if (title.includes("plate") || title.includes("weight") || title.includes("dumbbell") || title.includes("gym") || title.includes("fitness")) {
    icon = "🏋️‍♂️";
    bg = "#2563EB";
    categoryLabel = "Gym & Fitness";
  } else if (title.includes("costume") || title.includes("bodysuit") || title.includes("cosplay")) {
    icon = "🦸‍♂️";
    bg = "#DC2626";
    categoryLabel = "Cosplay";
  } else if (title.includes("hoodie") || title.includes("jacket") || title.includes("shirt") || title.includes("streetwear")) {
    icon = "👕";
    bg = "#10B981";
    categoryLabel = "Streetwear";
  } else if (title.includes("mic") || title.includes("microphone") || title.includes("shure")) {
    icon = "🎙️";
    bg = "#6366F1";
    categoryLabel = "Audio & Mic";
  } else if (title.includes("headphone") || title.includes("sony") || title.includes("airpods")) {
    icon = "🎧";
    bg = "#8B5CF6";
    categoryLabel = "Headphones";
  } else if (title.includes("light") || title.includes("strobe") || title.includes("govee") || title.includes("elgato")) {
    icon = "💡";
    bg = "#F59E0B";
    categoryLabel = "Lighting";
  } else if (title.includes("cup") || title.includes("tumbler") || title.includes("stanley") || title.includes("bottle")) {
    icon = "🥤";
    bg = "#EC4899";
    categoryLabel = "Drinkware";
  } else if (title.includes("deck") || title.includes("controller") || title.includes("keyboard") || title.includes("pc")) {
    icon = "🎮";
    bg = "#14B8A6";
    categoryLabel = "Gaming";
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <rect width="120" height="120" rx="16" fill="#131924" stroke="${bg}" stroke-width="2"/>
    <circle cx="60" cy="46" r="28" fill="${bg}" opacity="0.25" />
    <text x="60" y="55" font-size="32" text-anchor="middle" dominant-baseline="middle">${icon}</text>
    <text x="60" y="96" font-size="9" font-weight="bold" fill="#F3F4F6" font-family="sans-serif" text-anchor="middle">${categoryLabel}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createProductCard(prod, type = "exact") {
  const card = document.createElement("div");
  card.className = "product-card";

  const asin = prod.asin || "B0002E4Z8M";
  const title = prod.title || "Amazon Live Stream Product";
  
  let priceStr = "29.99";
  if (typeof prod.price === "number") {
    priceStr = prod.price.toFixed(2);
  } else if (typeof prod.price === "string") {
    const num = parseFloat(prod.price.replace(/[^0-9.]/g, ""));
    priceStr = isNaN(num) ? "29.99" : num.toFixed(2);
  }

  const thumbUrl = getProductThumbnail(prod);
  const fallbackSvg = getProductThumbnail({ ...prod, image: null });

  const matchPill = type === "exact"
    ? `<span class="product-prime">prime</span>`
    : `<span style="color:#F59E0B; font-weight:700; font-size:10px;">⚡ ${prod.similarityScore || 90}% Match</span>`;

  card.innerHTML = `
    <div class="product-thumb">
      <img src="${thumbUrl}" alt="${title}" referrerpolicy="no-referrer" />
    </div>
    <div class="product-details">
      <div>
        <div class="product-title" title="${title}">${title}</div>
        <div class="product-meta-row">
          <span class="product-price">$${priceStr}</span>
          ${matchPill}
        </div>
        <div class="product-match-desc">${prod.matchReason || prod.detectionLabel || 'Detected in live stream'}</div>
      </div>
      <div class="card-actions">
        <button class="source-frame-btn" title="View exact video frame">
          <span>📸 Frame</span>
        </button>
        <button class="add-cart-btn" data-asin="${asin}">
          <span>🛒 Add</span>
        </button>
        <a href="${getAmazonProductUrl(asin, title, userAffiliateTag)}" target="_blank" class="view-btn amazon-link" title="Open on Amazon">
          <span>↗</span>
        </a>
      </div>
    </div>
  `;

  // Image error fallback
  const imgEl = card.querySelector(".product-thumb img");
  if (imgEl) {
    imgEl.addEventListener("error", () => {
      imgEl.src = fallbackSvg;
    });
  }

  // Source Frame modal trigger
  const frameBtn = card.querySelector(".source-frame-btn");
  frameBtn.addEventListener("click", () => {
    openSourceFrameModal(prod);
  });

  // Track click on link
  const amazonLink = card.querySelector(".amazon-link");
  amazonLink.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "TRACK_AMAZON_CLICK", price: parseFloat(priceStr), category: prod.category });
  });

  // Add to Cart action
  const addBtn = card.querySelector(".add-cart-btn");
  addBtn.addEventListener("click", () => {
    addToCart({ ...prod, asin, title, price: parseFloat(priceStr), image: thumbUrl }, addBtn);
  });

  return card;
}

function createCatalogProductCard(prod) {
  const card = document.createElement("div");
  card.className = "product-card";

  const asin = prod.asin || "B0002E4Z8M";
  const title = prod.title || "Amazon Product";
  const priceStr = Number(prod.price || 29.99).toFixed(2);
  const thumbUrl = getProductThumbnail(prod);
  const fallbackSvg = getProductThumbnail({ ...prod, image: null });

  card.innerHTML = `
    <div class="product-thumb">
      <img src="${thumbUrl}" alt="${title}" referrerpolicy="no-referrer" />
    </div>
    <div class="product-details">
      <div>
        <div class="product-title" title="${title}">${title}</div>
        <div class="product-meta-row">
          <span class="product-price">$${priceStr}</span>
          <span class="catalog-seen-tag">Seen ${prod.sightingCount || 1}x</span>
        </div>
        <div class="product-match-desc">📁 ${prod.category || 'Gear'} • From: ${prod.streamTitle?.slice(0, 24) || 'Stream'}</div>
      </div>
      <div class="card-actions">
        <button class="source-frame-btn" title="View source video snapshot">
          <span>📸 Frame</span>
        </button>
        <button class="add-cart-btn" data-asin="${asin}">
          <span>🛒 Add</span>
        </button>
        <a href="${getAmazonProductUrl(asin, title, userAffiliateTag)}" target="_blank" class="view-btn amazon-link" title="Open on Amazon">
          <span>↗</span>
        </a>
        <button class="view-btn delete-btn" title="Delete from catalog" style="color:#EF4444;">
          <span>✕</span>
        </button>
      </div>
    </div>
  `;

  // Image error fallback
  const imgEl = card.querySelector(".product-thumb img");
  if (imgEl) {
    imgEl.addEventListener("error", () => {
      imgEl.src = fallbackSvg;
    });
  }

  // Source Frame modal trigger
  const frameBtn = card.querySelector(".source-frame-btn");
  frameBtn.addEventListener("click", () => {
    openSourceFrameModal(prod);
  });

  // Track click on link
  const amazonLink = card.querySelector(".amazon-link");
  amazonLink.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "TRACK_AMAZON_CLICK", price: parseFloat(priceStr), category: prod.category });
  });

  // Add to Cart
  const addBtn = card.querySelector(".add-cart-btn");
  addBtn.addEventListener("click", () => {
    addToCart({ ...prod, asin, title, price: parseFloat(priceStr), image: thumbUrl }, addBtn);
  });

  // Delete
  const delBtn = card.querySelector(".delete-btn");
  delBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "DELETE_CATALOG_ITEM", id: prod.id });
  });

  return card;
}

function addToCart(prod, buttonEl) {
  const originalText = buttonEl.innerHTML;
  buttonEl.innerHTML = `<span>✓ Cart</span>`;
  buttonEl.style.background = "#10B981";

  chrome.runtime.sendMessage({
    action: "ADD_TO_CART",
    product: prod
  }, (res) => {
    if (res && res.cartItems) {
      renderCart(res.cartItems);
    }
  });

  const directCartUrl = getAmazonCartUrl(prod.asin, prod.title, 1, userAffiliateTag);
  window.open(directCartUrl, "_blank");

  setTimeout(() => {
    buttonEl.innerHTML = originalText;
    buttonEl.style.background = "";
  }, 2000);
}

function renderCart(items) {
  currentCart = items || [];
  const countBadge = document.getElementById("cart-count");
  const emptyState = document.getElementById("cart-empty-state");
  const contentView = document.getElementById("cart-content-view");
  const list = document.getElementById("cart-items-list");
  const subtotalEl = document.getElementById("cart-subtotal");
  const checkoutBtn = document.getElementById("amazon-checkout-btn");

  const totalQuantity = currentCart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  if (countBadge) countBadge.textContent = totalQuantity;

  if (currentCart.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    if (contentView) contentView.style.display = "none";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  if (contentView) contentView.style.display = "block";
  list.innerHTML = "";

  let totalPrice = 0;
  currentCart.forEach((item) => {
    const itemTotal = Number(item.price) * (item.quantity || 1);
    totalPrice += itemTotal;

    const row = document.createElement("div");
    row.className = "product-card";
    row.style.marginBottom = "8px";
    row.innerHTML = `
      <div class="product-thumb" style="width: 50px; height: 50px;">
        <img src="${item.image}" alt="${item.title}" />
      </div>
      <div class="product-details">
        <div class="product-title">${item.title}</div>
        <div class="product-meta-row">
          <span class="product-price">$${Number(item.price).toFixed(2)}</span>
          <span style="font-size:11px; color:#9CA3AF;">Qty: ${item.quantity || 1}</span>
        </div>
      </div>
    `;
    list.appendChild(row);
  });

  if (subtotalEl) subtotalEl.textContent = `$${totalPrice.toFixed(2)}`;

  if (currentCart.length > 0 && checkoutBtn) {
    checkoutBtn.href = getAmazonCartUrl(currentCart[0].asin, currentCart[0].title, currentCart[0].quantity || 1, userAffiliateTag);
  }
}

function renderAnalytics(data) {
  chrome.storage.local.get(["analytics", "affiliateTag"], (res) => {
    const analytics = data || res.analytics || { totalScans: 0, amazonClicks: 0, cartAdds: 0, estimatedEarnings: 0 };
    const tag = res.affiliateTag || "streamsnap-20";

    const scansEl = document.getElementById("metric-scans");
    const clicksEl = document.getElementById("metric-clicks");
    const cartEl = document.getElementById("metric-cart");
    const earningsEl = document.getElementById("metric-earnings");
    const tagEl = document.getElementById("active-tag-label");

    if (scansEl) scansEl.textContent = analytics.totalScans || 0;
    if (clicksEl) clicksEl.textContent = analytics.amazonClicks || 0;
    if (cartEl) cartEl.textContent = analytics.cartAdds || 0;
    if (earningsEl) earningsEl.textContent = `$${Number(analytics.estimatedEarnings || 0).toFixed(2)}`;
    if (tagEl) tagEl.textContent = tag;
  });
}

