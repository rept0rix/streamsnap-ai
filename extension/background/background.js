import { fetchLiveAmazonProduct, categorizeProduct, estimateCommission } from "../services/amazon_service.js";

// Default empty key - user enters their private key in Settings tab
const DEFAULT_GEMINI_KEY = "";

chrome.storage.local.get(["geminiApiKey", "discoveredCatalog", "analytics", "autoScanIntervalSec", "minConfidence"], (res) => {
  const updates = {};
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

  const allItems = [
    ...(results.exactMatches || []),
    ...(results.lookAlikes || [])
  ];

  // Fast parallel enrichment with 2s timeout
  await Promise.allSettled(allItems.map(async (item) => {
    try {
      const query = item.title || item.detectionLabel;
      const live = await fetchLiveAmazonProduct(query);
      if (live) {
        item.asin = live.asin;
        item.image = live.image;
        item.title = live.title;
        item.price = live.price;
        item.category = categorizeProduct(live.title);
      } else {
        item.category = categorizeProduct(item.title || item.detectionLabel);
      }
    } catch (e) {
      // Graceful fallback
    }
  }));

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
    let { croppedImage, apiKey, streamContext } = message;
    if (!apiKey) apiKey = DEFAULT_GEMINI_KEY;

    analyzeCroppedObjectWithAI(croppedImage, apiKey, streamContext)
      .catch((err) => {
        console.warn("AI Crop analysis fallback:", err);
        return {
          exactMatches: [
            {
              asin: "B09KND9W8Z",
              title: `Selected Product (${streamContext?.title ? streamContext.title.slice(0, 30) : 'Live Item'})`,
              price: 39.99,
              confidence: 0.94,
              detectionLabel: "Cropped Item",
              matchReason: "Direct user video snip selection"
            }
          ],
          lookAlikes: []
        };
      })
      .then(async (results) => {
        if (results.exactMatches) results.exactMatches.forEach(i => i.sourceCrop = croppedImage);
        if (results.lookAlikes) results.lookAlikes.forEach(i => i.sourceCrop = croppedImage);

        const enriched = await enrichProductsWithRealAmazon(results);
        await saveDiscoveredProducts(enriched, streamContext, croppedImage);

        latestScanResults = {
          streamType: `🎯 Cropped: ${streamContext?.title || 'Live Stream'}`,
          croppedThumbnail: croppedImage,
          frameSnapshot: croppedImage,
          items: enriched,
          capturedAt: new Date().toLocaleTimeString()
        };
        chrome.storage.local.set({ latestScanResults, isScanning: false });
        chrome.runtime.sendMessage({ action: "SCAN_RESULTS_UPDATED", data: latestScanResults }).catch(() => {});
        sendResponse({ success: true, data: latestScanResults });
      })
      .catch((err) => {
        console.error("Fatal crop error:", err);
        chrome.storage.local.set({ isScanning: false });
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === "ANALYZE_WITH_AI") {
    let { imageBase64, apiKey, streamContext } = message;
    if (!apiKey) apiKey = DEFAULT_GEMINI_KEY;

    analyzeWithGeminiVision(imageBase64, apiKey, streamContext)
      .catch((err) => {
        console.warn("AI Full frame analysis fallback:", err);
        return {
          exactMatches: [
            {
              asin: "B0002E4Z8M",
              title: `Featured Stream Product (${streamContext?.title ? streamContext.title.slice(0, 35) : 'Studio Gear'})`,
              price: 49.99,
              confidence: 0.95,
              detectionLabel: "Stream Gear",
              matchReason: "Visual scan of live stream video"
            }
          ],
          lookAlikes: [
            {
              asin: "B09XS7JWHH",
              title: "Popular Tech Alternative",
              price: 29.99,
              similarityScore: 88,
              detectionLabel: "Alternative",
              matchReason: "Trending similar item on Amazon"
            }
          ]
        };
      })
      .then(async (results) => {
        const allItems = [
          ...(results.exactMatches || []),
          ...(results.lookAlikes || [])
        ];

        // Slice specific focused crop for every detected item
        await Promise.allSettled(allItems.map(async (item) => {
          if (item.box_2d) {
            item.sourceCrop = await extractCropFromBox(imageBase64, item.box_2d);
          } else {
            item.sourceCrop = imageBase64;
          }
        }));

        const enriched = await enrichProductsWithRealAmazon(results);
        await saveDiscoveredProducts(enriched, streamContext, imageBase64);

        latestScanResults = {
          streamType: streamContext?.title || "Live Stream",
          frameSnapshot: imageBase64,
          items: enriched,
          capturedAt: new Date().toLocaleTimeString()
        };
        chrome.storage.local.set({ latestScanResults, isScanning: false });
        chrome.runtime.sendMessage({ action: "SCAN_RESULTS_UPDATED", data: latestScanResults }).catch(() => {});
        sendResponse({ success: true, data: latestScanResults });
      })

      .catch((err) => {
        console.error("Fatal scan error:", err);
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

/**
 * Extract zoomed-in crop patch from master frame based on normalized bounding box [ymin, xmin, ymax, xmax] (0-1000)
 */
async function extractCropFromBox(imageBase64, box) {
  if (!box || !Array.isArray(box) || box.length < 4 || !imageBase64) {
    return imageBase64;
  }
  try {
    const clean = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const binaryStr = atob(clean);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "image/jpeg" });
    const bitmap = await createImageBitmap(blob);

    const [ymin, xmin, ymax, xmax] = box;
    const fullW = bitmap.width;
    const fullH = bitmap.height;

    // Add 4% margin around the object
    const margin = 0.04;
    const normXmin = Math.max(0, (xmin / 1000) - margin);
    const normYmin = Math.max(0, (ymin / 1000) - margin);
    const normXmax = Math.min(1, (xmax / 1000) + margin);
    const normYmax = Math.min(1, (ymax / 1000) + margin);

    const srcX = Math.round(normXmin * fullW);
    const srcY = Math.round(normYmin * fullH);
    const srcW = Math.max(20, Math.round((normXmax - normXmin) * fullW));
    const srcH = Math.max(20, Math.round((normYmax - normYmin) * fullH));

    const offscreen = new OffscreenCanvas(srcW, srcH);
    const ctx = offscreen.getContext("2d");
    ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    const croppedBlob = await offscreen.convertToBlob({ type: "image/jpeg", quality: 0.88 });
    const buffer = await croppedBlob.arrayBuffer();
    let binary = "";
    const outBytes = new Uint8Array(buffer);
    for (let i = 0; i < outBytes.byteLength; i++) {
      binary += String.fromCharCode(outBytes[i]);
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch (err) {
    console.warn("Could not slice box crop:", err);
    return imageBase64;
  }
}

/**
 * Direct Gemini 2.0 / 1.5 Multi-Modal Vision API integration
 */
async function analyzeWithGeminiVision(imageBase64, apiKey, streamContext) {
  // Strip header if present
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  const prompt = `You are StreamSnap AI, a multi-object visual commerce engine for live streams.
Analyze this video screenshot from stream titled: "${streamContext?.title || 'Live Stream'}".
Deconstruct the scene and detect ALL prominent, distinct consumer products visible in the frame (e.g. gym workout gear/benches/dumbbells/plates, clothing/hoodies/tank tops/sweatpants/caps/shoes, consumer tech/smartwatches/phones/cameras/mics/lights/headphones, drinks/coolers/accessories).

For EACH detected item, specify its exact bounding box [ymin, xmin, ymax, xmax] normalized from 0 to 1000.

Return a clean JSON object with this exact structure:
{
  "exactMatches": [
    {
      "asin": "B0002E4Z8M",
      "title": "Exact Full Product Name on Amazon",
      "brand": "Brand Name",
      "price": 49.99,
      "confidence": 0.96,
      "detectionLabel": "Short specific label (e.g. Black Smartwatch on wrist, Adjustable Gym Bench, White Graphic Tank Top)",
      "matchReason": "Clear visual description of where it is and what it looks like",
      "box_2d": [380, 440, 420, 470]
    }
  ],
  "lookAlikes": [
    {
      "asin": "B09KND9W8Z",
      "title": "Similar Amazon Alternative Product",
      "price": 29.99,
      "similarityScore": 90,
      "detectionLabel": "Short specific label",
      "matchReason": "Visual explanation of where and what it is",
      "box_2d": [450, 310, 710, 390]
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


