import { fetchLiveAmazonProduct, categorizeProduct, estimateCommission } from "../services/amazon_service.js";

// Pre-configure Gemini API Key and settings
const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6IQE3yEL-bhBlLLnC6Nx5ySk_tUxFaYWosQGXu7MIljDA";

chrome.storage.local.get(["geminiApiKey", "discoveredCatalog", "analytics", "autoScanIntervalSec", "minConfidence"], (res) => {
  const updates = {};
  if (!res || !res.geminiApiKey) updates.geminiApiKey = DEFAULT_GEMINI_KEY;
  if (!res || !res.discoveredCatalog) updates.discoveredCatalog = [];
  if (!res || !res.analytics) updates.analytics = { totalScans: 0, amazonClicks: 0, cartAdds: 0, estimatedEarnings: 0 };
  if (!res || res.autoScanIntervalSec === undefined) updates.autoScanIntervalSec = 0; // 0 = manual, 15, 30, 60
  if (!res || res.minConfidence === undefined) updates.minConfidence = 75; // 75% default
  if (Object.keys(updates).length > 0) chrome.storage.local.set(updates);
});

// Enable side panel to open on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting panel behavior:", error));

// When extension icon is clicked in toolbar, trigger scan on active tab
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    chrome.tabs.sendMessage(tab.id, { action: "TRIGGER_SCAN" }).catch(() => {});
  }
});

let latestScanResults = null;
let liveRequests = [];
let cartItems = [];
let autoScanTimer = null;

// Auto-Scan interval scheduler
function setupAutoScanTimer(intervalSeconds) {
  if (autoScanTimer) {
    clearInterval(autoScanTimer);
    autoScanTimer = null;
  }

  if (intervalSeconds && intervalSeconds > 0) {
    console.log(`⚡ StreamSnap Auto-Scan started: every ${intervalSeconds}s`);
    autoScanTimer = setInterval(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "TRIGGER_AUTO_SCAN" }).catch(() => {});
        }
      });
    }, intervalSeconds * 1000);
  }
}

// Check auto-scan on startup
chrome.storage.local.get(["autoScanIntervalSec"], (res) => {
  if (res && res.autoScanIntervalSec > 0) {
    setupAutoScanTimer(res.autoScanIntervalSec);
  }
});

// Listen for settings change to update timer
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.autoScanIntervalSec) {
    setupAutoScanTimer(changes.autoScanIntervalSec.newValue);
  }
});

/**
 * Deduplicate & Save Discovered Products into Global Catalog
 */
async function saveDiscoveredProducts(enrichedResults, streamContext, sourceCrop) {
  if (!enrichedResults) return;

  const catalogRes = await chrome.storage.local.get(["discoveredCatalog", "analytics"]);
  let catalog = catalogRes.discoveredCatalog || [];
  let analytics = catalogRes.analytics || { totalScans: 0, amazonClicks: 0, cartAdds: 0, estimatedEarnings: 0 };

  analytics.totalScans = (analytics.totalScans || 0) + 1;

  const allItems = [
    ...(enrichedResults.exactMatches || []).map(i => ({ ...i, tier: "exact" })),
    ...(enrichedResults.lookAlikes || []).map(i => ({ ...i, tier: "lookalike" }))
  ];

  for (const item of allItems) {
    const asin = item.asin || "";
    const normTitle = (item.title || "").toLowerCase().trim();
    const category = categorizeProduct(item.title || item.detectionLabel);
    const commission = estimateCommission(item.price || 29.99, category);

    // Check if product already exists in catalog (by ASIN or close title match)
    const existingIndex = catalog.findIndex(p => 
      (asin && p.asin === asin && !asin.startsWith("B000000")) ||
      (normTitle && p.title && p.title.toLowerCase().trim() === normTitle)
    );

    if (existingIndex >= 0) {
      // Update existing item
      catalog[existingIndex].sightingCount = (catalog[existingIndex].sightingCount || 1) + 1;
      catalog[existingIndex].lastSeenAt = new Date().toISOString();
      catalog[existingIndex].lastStream = streamContext?.title || "Live Stream";
      if (sourceCrop && !catalog[existingIndex].sourceCrop) {
        catalog[existingIndex].sourceCrop = sourceCrop;
      }
    } else {
      // Add new unique product
      catalog.unshift({
        id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        asin: item.asin || `B0${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        title: item.title || "Live Stream Item",
        price: item.price || 29.99,
        image: item.image || null,
        category: category,
        tier: item.tier || "exact",
        confidence: item.confidence || item.similarityScore || 90,
        matchReason: item.matchReason || item.detectionLabel || "Detected in video stream",
        sourceCrop: sourceCrop || null,
        streamTitle: streamContext?.title || "Live Stream",
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        sightingCount: 1,
        estimatedCommission: commission
      });
    }
  }

  await chrome.storage.local.set({ discoveredCatalog: catalog, analytics });
  chrome.runtime.sendMessage({ action: "CATALOG_UPDATED", discoveredCatalog: catalog }).catch(() => {});
}

async function enrichProductsWithRealAmazon(results) {
  if (!results) return results;

  // Enrich Exact Matches
  if (results.exactMatches && results.exactMatches.length > 0) {
    for (const item of results.exactMatches) {
      const query = item.title || item.detectionLabel;
      const live = await fetchLiveAmazonProduct(query);
      if (live) {
        item.asin = live.asin;
        item.image = live.image;
        item.title = live.title;
        item.price = live.price;
        item.category = categorizeProduct(live.title);
      }
    }
  }

  // Enrich Look-Alikes
  if (results.lookAlikes && results.lookAlikes.length > 0) {
    for (const item of results.lookAlikes) {
      const query = item.title || item.detectionLabel;
      const live = await fetchLiveAmazonProduct(query);
      if (live) {
        item.asin = live.asin;
        item.image = live.image;
        item.title = live.title;
        item.price = live.price;
        item.category = categorizeProduct(live.title);
      }
    }
  }

  return results;
}

// Listen for incoming messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "OPEN_SIDEPANEL") {
    if (sender.tab && sender.tab.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch((err) => {
        console.warn("Could not open side panel:", err);
      });
    }
    sendResponse({ status: "ok" });
    return true;
  }

  if (message.action === "CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 85 }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ error: chrome.runtime.lastError?.message || "Failed to capture tab" });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }

  if (message.action === "ANALYZE_CROPPED_IMAGE") {
    const { croppedImage, apiKey, streamContext } = message;
    analyzeCroppedObjectWithAI(croppedImage, apiKey, streamContext)
      .then(async (results) => {
        const enriched = await enrichProductsWithRealAmazon(results);
        await saveDiscoveredProducts(enriched, streamContext, croppedImage);

        latestScanResults = {
          streamType: `🎯 Cropped: ${streamContext?.title || 'Live Stream'}`,
          croppedThumbnail: croppedImage,
          items: enriched,
          capturedAt: new Date().toLocaleTimeString()
        };
        chrome.storage.local.set({ latestScanResults, isScanning: false });
        chrome.runtime.sendMessage({ action: "SCAN_RESULTS_UPDATED", data: latestScanResults }).catch(() => {});
        sendResponse({ success: true, data: latestScanResults });
      })
      .catch((err) => {
        console.error("Crop AI analysis error:", err);
        chrome.storage.local.set({ isScanning: false });
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === "ANALYZE_WITH_AI") {
    const { imageBase64, apiKey, streamContext } = message;
    analyzeWithGeminiVision(imageBase64, apiKey, streamContext)
      .then(async (results) => {
        const enriched = await enrichProductsWithRealAmazon(results);
        await saveDiscoveredProducts(enriched, streamContext, imageBase64);

        latestScanResults = {
          streamType: streamContext?.title || "Live Stream",
          items: enriched,
          capturedAt: new Date().toLocaleTimeString()
        };
        chrome.storage.local.set({ latestScanResults, isScanning: false });
        chrome.runtime.sendMessage({ action: "SCAN_RESULTS_UPDATED", data: latestScanResults }).catch(() => {});
        sendResponse({ success: true, data: latestScanResults });
      })
      .catch((err) => {
        chrome.storage.local.set({ isScanning: false });
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === "TRACK_AMAZON_CLICK") {
    chrome.storage.local.get(["analytics"], (res) => {
      const analytics = res.analytics || { totalScans: 0, amazonClicks: 0, cartAdds: 0, estimatedEarnings: 0 };
      analytics.amazonClicks = (analytics.amazonClicks || 0) + 1;
      const commission = message.price ? estimateCommission(message.price, message.category || "") : 1.50;
      analytics.estimatedEarnings = parseFloat(((analytics.estimatedEarnings || 0) + commission * 0.15).toFixed(2)); // estimated EPC
      chrome.storage.local.set({ analytics });
      chrome.runtime.sendMessage({ action: "ANALYTICS_UPDATED", analytics }).catch(() => {});
    });
    sendResponse({ status: "tracked" });
    return true;
  }

  if (message.action === "CLEAR_CATALOG") {
    chrome.storage.local.set({ discoveredCatalog: [] }, () => {
      chrome.runtime.sendMessage({ action: "CATALOG_UPDATED", discoveredCatalog: [] }).catch(() => {});
      sendResponse({ status: "cleared" });
    });
    return true;
  }

  if (message.action === "DELETE_CATALOG_ITEM") {
    const itemId = message.id;
    chrome.storage.local.get(["discoveredCatalog"], (res) => {
      const catalog = (res.discoveredCatalog || []).filter(item => item.id !== itemId);
      chrome.storage.local.set({ discoveredCatalog: catalog }, () => {
        chrome.runtime.sendMessage({ action: "CATALOG_UPDATED", discoveredCatalog: catalog }).catch(() => {});
        sendResponse({ status: "deleted", discoveredCatalog: catalog });
      });
    });
    return true;
  }

  if (message.action === "GET_LATEST_SCAN") {
    if (latestScanResults) {
      sendResponse({ data: latestScanResults });
    } else {
      chrome.storage.local.get(["latestScanResults"], (result) => {
        latestScanResults = result.latestScanResults || null;
        sendResponse({ data: latestScanResults });
      });
    }
    return true;
  }

  if (message.action === "ADD_TO_CART") {
    const product = message.product;
    if (product) {
      const existing = cartItems.find((item) => item.asin === product.asin);
      if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
      } else {
        cartItems.push({ ...product, quantity: 1, addedAt: Date.now() });
      }
      
      chrome.storage.local.get(["analytics"], (res) => {
        const analytics = res.analytics || { totalScans: 0, amazonClicks: 0, cartAdds: 0, estimatedEarnings: 0 };
        analytics.cartAdds = (analytics.cartAdds || 0) + 1;
        const comm = estimateCommission(product.price || 29.99, product.category || "");
        analytics.estimatedEarnings = parseFloat(((analytics.estimatedEarnings || 0) + comm).toFixed(2));
        chrome.storage.local.set({ cartItems, analytics });
      });

      chrome.runtime.sendMessage({ action: "CART_UPDATED", cartItems }).catch(() => {});
    }
    sendResponse({ status: "added", cartItems });
    return true;
  }

  if (message.action === "GET_CART") {
    chrome.storage.local.get(["cartItems"], (result) => {
      cartItems = result.cartItems || [];
      sendResponse({ cartItems });
    });
    return true;
  }

  if (message.action === "CLEAR_CART") {
    cartItems = [];
    chrome.storage.local.set({ cartItems: [] });
    chrome.runtime.sendMessage({ action: "CART_UPDATED", cartItems: [] }).catch(() => {});
    sendResponse({ status: "cleared" });
    return true;
  }

  if (message.action === "SUBMIT_REQUEST") {
    const requestItem = message.requestItem;
    liveRequests.push({
      ...requestItem,
      submittedAt: Date.now(),
      status: "Pinged Creator ⚡"
    });
    chrome.storage.local.set({ liveRequests });
    chrome.runtime.sendMessage({ action: "REQUESTS_UPDATED", liveRequests }).catch(() => {});
    sendResponse({ status: "submitted", liveRequests });
    return true;
  }

  if (message.action === "GET_REQUESTS") {
    chrome.storage.local.get(["liveRequests"], (result) => {
      liveRequests = result.liveRequests || [];
      sendResponse({ liveRequests });
    });
    return true;
  }
});

});

/**
 * Direct Gemini 2.0 / 1.5 Multi-Modal Vision API integration
 */
async function analyzeWithGeminiVision(imageBase64, apiKey, streamContext) {
  // Strip header if present
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  const prompt = `You are StreamSnap AI, a visual shopping engine for live streams.
Analyze this video screenshot from stream titled: "${streamContext?.title || 'Live Stream'}".
Identify visible consumer products (microphones, headphones, clothing, cups/bottles, lights, desk pads, electronics, etc.).

Return a clean JSON object with this exact structure:
{
  "exactMatches": [
    {
      "asin": "B0002E4Z8M",
      "title": "Exact Full Product Name",
      "brand": "Brand",
      "price": 99.99,
      "image": "https://m.media-amazon.com/images/I/71P4q+HqKQL._AC_SL1500_.jpg",
      "confidence": 0.95,
      "detectionLabel": "Short Label",
      "matchReason": "Why it matched",
      "boundingBox": {"ymin": 20, "xmin": 30, "ymax": 60, "xmax": 70}
    }
  ],
  "lookAlikes": [
    {
      "asin": "B09KND9W8Z",
      "title": "Similar Amazon Alternative Product",
      "price": 39.99,
      "image": "https://m.media-amazon.com/images/I/71p0W+3XfUL._AC_UX679_.jpg",
      "similarityScore": 90,
      "detectionLabel": "Short Label",
      "matchReason": "Visual similarity explanation",
      "boundingBox": {"ymin": 40, "xmin": 20, "ymax": 85, "xmax": 60}
    }
  ],
  "unidentifiedRequests": [
    {
      "id": "req_1",
      "label": "Item Description",
      "category": "Apparel/Decor",
      "reason": "Why brand is obscured",
      "requestCount": 5,
      "boundingBox": {"ymin": 50, "xmin": 50, "ymax": 70, "xmax": 70}
    }
  ]
}`;

  let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: cleanBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json"
      }
    })
  });

  if (!response.ok) {
    // Fallback to gemini-flash-latest
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: cleanBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error: ${errorText}`);
  }

  const json = await response.json();
  const textContent = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const clean = textContent.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}


/**
 * Direct Pinpoint Multi-Modal Vision Analysis on a user-selected Crop
 */
async function analyzeCroppedObjectWithAI(croppedBase64, apiKey, streamContext) {
  if (!croppedBase64) {
    throw new Error("No cropped image provided");
  }

  const cleanBase64 = croppedBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  const prompt = `You are StreamSnap AI, a visual search and shopping engine.
The user clicked and CROPPED this specific object on a live stream titled: "${streamContext?.title || 'Live Stream'}".
Analyze ONLY this specific cropped item in the image (e.g. superhero suit, mask, mic, bottle, hoodie, logo, shoes, gadget).

Return a clean JSON object with this exact structure:
{
  "exactMatches": [
    {
      "asin": "B0002E4Z8M",
      "title": "Exact Full Product Name on Amazon",
      "brand": "Brand Name",
      "price": 39.99,
      "confidence": 0.96,
      "detectionLabel": "Cropped Item",
      "matchReason": "Exact visual match for the selected crop"
    }
  ],
  "lookAlikes": [
    {
      "asin": "B09KND9W8Z",
      "title": "Top Rated Alternative on Amazon",
      "price": 29.99,
      "similarityScore": 92,
      "detectionLabel": "Alternative Item",
      "matchReason": "Style and form match for the cropped selection"
    }
  ],
  "unidentifiedRequests": []
}`;

  let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: cleanBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json"
      }
    })
  });

  if (!response.ok) {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: cleanBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error: ${errorText}`);
  }

  const json = await response.json();
  const textContent = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const clean = textContent.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}


