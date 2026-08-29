/**
 * StreamSnap AI — Universal Video Content Script
 * Injects on YouTube, Twitch, TikTok, Facebook Live, Kick & Demo pages.
 */

(function () {
  console.log("⚡ StreamSnap AI Video Hook Loaded");

  // Track injected videos to prevent duplicates
  const hookedVideos = new WeakSet();

  function initUniversalVideoHook() {
    // Check standard video tags and YouTube specific players
    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      if (hookedVideos.has(video)) return;
      hookedVideos.add(video);

      attachStreamSnapControls(video);
    });

    // YouTube specific player hook
    const ytPlayer = document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
    if (ytPlayer) {
      const ytVideo = ytPlayer.querySelector("video");
      if (ytVideo) {
        attachStreamSnapControls(ytVideo, ytPlayer);
      }
    }
  }

  let isLiveClickModeActive = false;

  function attachStreamSnapControls(video, explicitContainer = null) {
    const parent = explicitContainer || video.parentElement;
    if (!parent) return;

    // 1. Floating Top-Right Button Group (Live Click + Snip + Full Scan)
    if (!parent.querySelector(".streamsnap-btn-group")) {
      const computedStyle = window.getComputedStyle(parent);
      if (computedStyle.position === "static") {
        parent.style.position = "relative";
      }

      const btnGroup = document.createElement("div");
      btnGroup.className = "streamsnap-btn-group";

      // 1. Live Click Mode Toggle Button
      const liveBtn = document.createElement("button");
      liveBtn.className = "streamsnap-floating-btn streamsnap-live-btn";
      liveBtn.innerHTML = `<span>🟢</span> Click-to-Find: ON`;
      liveBtn.title = "Live Point-and-Click: Click ANY object on the video while playing to identify it on Amazon!";
      
      liveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        isLiveClickModeActive = !isLiveClickModeActive;
        if (isLiveClickModeActive) {
          liveBtn.classList.add("active");
          liveBtn.innerHTML = `<span>🔴</span> Click Anything Live`;
          showToast(parent, "🟢 Live Click Mode ON! Just click ANY object on the video to find it on Amazon!");
        } else {
          liveBtn.classList.remove("active");
          liveBtn.innerHTML = `<span>🟢</span> Click-to-Find`;
          showToast(parent, "Live Click Mode OFF");
        }
      });

      // 2. Snip on Video Button
      const snipBtn = document.createElement("button");
      snipBtn.className = "streamsnap-floating-btn streamsnap-snip-btn";
      snipBtn.innerHTML = `<span style="font-size:14px;">🎯</span> Snip Box`;
      snipBtn.title = "Draw a box on any item to search";
      snipBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        startInteractiveCropper(video, parent);
      });

      // 3. Full Scan Button
      const scanBtn = document.createElement("button");
      scanBtn.className = "streamsnap-floating-btn";
      scanBtn.innerHTML = `<span class="streamsnap-bolt">⚡</span> Scan Frame`;
      scanBtn.title = "Scan entire stream frame (Option+S / Alt+S)";
      scanBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        triggerStreamScan(video, parent);
      });

      btnGroup.appendChild(liveBtn);
      btnGroup.appendChild(snipBtn);
      btnGroup.appendChild(scanBtn);
      parent.appendChild(btnGroup);

      // Attach direct click-to-identify listener on video
      parent.addEventListener("click", (e) => {
        if (!isLiveClickModeActive) return;
        if (e.target.closest(".streamsnap-btn-group") || e.target.closest(".streamsnap-toast") || e.target.closest(".ytp-chrome-bottom")) {
          return; // Ignore controls
        }

        e.stopPropagation();
        const rect = parent.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Show pulse ripple at click point
        showClickPulse(parent, clickX, clickY);

        // Crop 180x180 area around click
        const cropSize = 180;
        const left = Math.max(0, clickX - cropSize / 2);
        const top = Math.max(0, clickY - cropSize / 2);
        const width = Math.min(rect.width - left, cropSize);
        const height = Math.min(rect.height - top, cropSize);

        cropAndSearch(video, parent, left, top, width, height, rect.width, rect.height);
      }, true);
    }

    // 2. YouTube Native Control Bar Button (.ytp-right-controls)
    const ytRightControls = document.querySelector(".ytp-right-controls");
    if (ytRightControls && !ytRightControls.querySelector(".streamsnap-ytp-btn")) {
      const ytBtn = document.createElement("button");
      ytBtn.className = "ytp-button streamsnap-ytp-btn";
      ytBtn.title = "StreamSnap AI — Click & Snip on Video (Option+S)";
      ytBtn.innerHTML = `<span style="font-size:16px; color:#FF9900; line-height:36px; display:inline-block;">🎯</span>`;
      ytBtn.style.textAlign = "center";
      ytBtn.style.cursor = "pointer";

      ytBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        startInteractiveCropper(video, parent);
      });

      ytRightControls.prepend(ytBtn);
    }
  }

  function showClickPulse(container, x, y) {
    const pulse = document.createElement("div");
    pulse.className = "streamsnap-click-pulse";
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    container.appendChild(pulse);
    setTimeout(() => pulse.remove(), 1300);
  }


  /**
   * Interactive Point-and-Snip Cropper on Video
   */
  function startInteractiveCropper(video, container) {
    // Remove any existing cropper
    const existing = container.querySelector(".streamsnap-interactive-cropper");
    if (existing) {
      existing.remove();
      return;
    }

    const cropper = document.createElement("div");
    cropper.className = "streamsnap-interactive-cropper";

    cropper.innerHTML = `
      <div class="streamsnap-cropper-banner">
        <span>🎯 Click or Drag over ANY object to find it on Amazon</span>
        <button class="streamsnap-cropper-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="streamsnap-cropper-selection" style="display:none;"></div>
    `;

    container.appendChild(cropper);

    const closeBtn = cropper.querySelector(".streamsnap-cropper-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        cropper.remove();
      });
    }

    const selection = cropper.querySelector(".streamsnap-cropper-selection");
    let isDrawing = false;
    let startX = 0, startY = 0;
    let endX = 0, endY = 0;

    function handleMouseDown(e) {
      if (e.target.closest(".streamsnap-cropper-banner")) return;
      e.stopPropagation();
      e.preventDefault();
      isDrawing = true;
      const rect = cropper.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      endX = startX;
      endY = startY;

      selection.style.left = `${startX}px`;
      selection.style.top = `${startY}px`;
      selection.style.width = `0px`;
      selection.style.height = `0px`;
      selection.style.display = "block";
    }

    function handleMouseMove(e) {
      if (!isDrawing) return;
      e.stopPropagation();
      const rect = cropper.getBoundingClientRect();
      endX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      endY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

      const left = Math.min(startX, endX);
      const top = Math.min(startY, endY);
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);

      selection.style.left = `${left}px`;
      selection.style.top = `${top}px`;
      selection.style.width = `${width}px`;
      selection.style.height = `${height}px`;
    }

    function handleMouseUp(e) {
      if (!isDrawing) return;
      isDrawing = false;
      e.stopPropagation();

      const rect = cropper.getBoundingClientRect();
      let left = Math.min(startX, endX);
      let top = Math.min(startY, endY);
      let width = Math.abs(endX - startX);
      let height = Math.abs(endY - startY);

      // If user simply clicked (without dragging), create a smart 160x160 crop centered on click!
      if (width < 20 || height < 20) {
        const cropSize = 160;
        left = Math.max(0, startX - cropSize / 2);
        top = Math.max(0, startY - cropSize / 2);
        width = Math.min(rect.width - left, cropSize);
        height = Math.min(rect.height - top, cropSize);
      }

      // Show immediate pulse effect at center of selection
      showClickPulse(container, left + width / 2, top + height / 2);

      // Crop the selected region & send to AI
      cropAndSearch(video, container, left, top, width, height, rect.width, rect.height);
      
      // Cleanly remove overlay immediately so user is never blocked!
      cropper.remove();
      document.removeEventListener("keydown", handleKeyDown);
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        cropper.remove();
        document.removeEventListener("keydown", handleKeyDown);
      }
    }

    cropper.addEventListener("mousedown", handleMouseDown, true);
    cropper.addEventListener("mousemove", handleMouseMove, true);
    cropper.addEventListener("mouseup", handleMouseUp, true);
    document.addEventListener("keydown", handleKeyDown);
  }


  function cropFromScreenshot(screenshotDataUrl, x, y, width, height) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        } catch (e) {
          console.warn("Screenshot crop error:", e);
          resolve(screenshotDataUrl);
        }
      };
      img.onerror = () => {
        resolve(screenshotDataUrl);
      };
      img.src = screenshotDataUrl;
    });
  }

  async function cropAndSearch(video, container, cropX, cropY, cropW, cropH, totalW, totalH) {
    // 1. Open SidePanel immediately
    chrome.runtime.sendMessage({ action: "OPEN_SIDEPANEL" });
    chrome.storage.local.set({ isScanning: true });

    showToast(container, "🎯 Slicing video selection & analyzing with Gemini AI...");

    const streamTitle = document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim()
      || document.querySelector("h2[data-a-target='stream-title']")?.textContent?.trim()
      || document.title;

    // 2. Capture high-res screenshot (100% CORS-proof)
    chrome.runtime.sendMessage({ action: "CAPTURE_VISIBLE_TAB" }, async (captureRes) => {
      const screenshotUrl = captureRes?.dataUrl;
      if (!screenshotUrl) {
        showToast(container, "⚠️ Screen capture error. Please retry.");
        return;
      }

      // Calculate absolute screen crop coordinates
      const containerRect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const absX = (containerRect.left + cropX) * dpr;
      const absY = (containerRect.top + cropY) * dpr;
      const absW = cropW * dpr;
      const absH = cropH * dpr;

      // Crop the high-res patch from the screenshot
      const croppedBase64 = await cropFromScreenshot(screenshotUrl, absX, absY, absW, absH);

      // 3. Send cropped image to background for pinpoint AI Vision analysis
      chrome.storage.local.get(["geminiApiKey"], (storageRes) => {
        const apiKey = storageRes.geminiApiKey;

        chrome.runtime.sendMessage({
          action: "ANALYZE_CROPPED_IMAGE",
          croppedImage: croppedBase64,
          apiKey: apiKey,
          streamContext: { title: streamTitle }
        }, (res) => {
          if (res && res.success) {
            showToast(container, `🎯 Found matching Amazon product! Check Side Panel ➔`);
          } else {
            showToast(container, `⚠️ AI Scan failed: ${res?.error || 'Check API key'}`);
          }
        });
      });
    });
  }




  async function captureTargetVideoFrame(video, container) {
    // 1. Try direct video element drawImage (Fastest, zero background UI!)
    try {
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.90);
        if (dataUrl && dataUrl.length > 500) {
          return dataUrl;
        }
      }
    } catch (e) {
      console.warn("Direct video canvas capture blocked by CORS, falling back to viewport crop:", e);
    }

    // 2. Fallback: Capture visible tab and strictly crop to the video element bounds!
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "CAPTURE_VISIBLE_TAB" }, async (captureRes) => {
        const screenshotUrl = captureRes?.dataUrl;
        if (!screenshotUrl) {
          resolve(null);
          return;
        }
        const targetEl = video || container;
        const rect = targetEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const absX = Math.max(0, rect.left * dpr);
        const absY = Math.max(0, rect.top * dpr);
        const absW = Math.max(10, rect.width * dpr);
        const absH = Math.max(10, rect.height * dpr);

        const cropped = await cropFromScreenshot(screenshotUrl, absX, absY, absW, absH);
        resolve(cropped);
      });
    });
  }

  async function triggerStreamScan(video, container, isSilent = false) {
    if (!isSilent) {
      renderLaserScan(container);
      chrome.runtime.sendMessage({ action: "OPEN_SIDEPANEL" });
    }
    chrome.storage.local.set({ isScanning: true });

    // Extract Stream Metadata (YouTube / Twitch / TikTok / Custom)
    const streamTitle = document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim()
      || document.querySelector("h2[data-a-target='stream-title']")?.textContent?.trim()
      || document.title;

    const channelName = document.querySelector("#channel-name yt-formatted-string")?.textContent?.trim()
      || document.querySelector("h1[data-a-target='user-channel-name']")?.textContent?.trim()
      || "Live Streamer";

    if (!isSilent) {
      showToast(container, `Scanning "${streamTitle.slice(0, 30)}..." with StreamSnap AI ⚡`);
    }

    // Capture ONLY the clean video frame
    const capturedImage = await captureTargetVideoFrame(video, container);

    chrome.storage.local.get(["geminiApiKey"], (storageRes) => {
      const apiKey = storageRes.geminiApiKey;

      if (apiKey && capturedImage) {
        if (!isSilent) showToast(container, "⚡ Running Live Multi-Object Vision...");
        chrome.runtime.sendMessage({
          action: "ANALYZE_WITH_AI",
          imageBase64: capturedImage,
          apiKey: apiKey,
          streamContext: { title: streamTitle, channel: channelName }
        }, (aiRes) => {
          if (aiRes && aiRes.success && aiRes.data) {
            renderBoundingBoxes(container, aiRes.data.items);
            if (!isSilent) showToast(container, `✓ Products identified and matched!`);
          } else {
            console.warn("AI analysis error:", aiRes?.error);
            if (!isSilent) showToast(container, `⚠️ AI Scan error. Check API key in Setup.`);
          }
        });
      } else if (!apiKey) {
        if (!isSilent) showToast(container, "⚠️ Please enter your Gemini API Key in the Setup tab ⚙️");
      } else {
        if (!isSilent) showToast(container, "⚠️ Could not capture video frame. Please retry.");
      }
    });
  }



  function renderLaserScan(container) {
    const existing = container.querySelector(".streamsnap-scan-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "streamsnap-scan-overlay";
    overlay.innerHTML = `<div class="streamsnap-scan-laser"></div>`;
    container.appendChild(overlay);

    setTimeout(() => overlay.remove(), 2200);
  }

  function renderBoundingBoxes(container, scanData) {
    if (!scanData) return;
    // Remove previous boxes
    container.querySelectorAll(".streamsnap-bbox").forEach((el) => el.remove());

    const exacts = scanData.exactMatches || [];
    const lookalikes = scanData.lookAlikes || [];
    const requests = scanData.unidentifiedRequests || [];

    const allItems = [
      ...exacts.map((m) => ({ ...m, badge: "🟢 Exact" })),
      ...lookalikes.map((m) => ({ ...m, badge: "🟡 Similar" })),
      ...requests.map((m) => ({ ...m, badge: "❓ Request" }))
    ];

    allItems.forEach((item) => {
      let topPct, leftPct, widthPct, heightPct;
      if (item.box_2d && Array.isArray(item.box_2d) && item.box_2d.length >= 4) {
        const [ymin, xmin, ymax, xmax] = item.box_2d;
        topPct = ymin / 10;
        leftPct = xmin / 10;
        widthPct = Math.max(4, (xmax - xmin) / 10);
        heightPct = Math.max(4, (ymax - ymin) / 10);
      } else if (item.boundingBox) {
        topPct = item.boundingBox.ymin;
        leftPct = item.boundingBox.xmin;
        widthPct = item.boundingBox.xmax - item.boundingBox.xmin;
        heightPct = item.boundingBox.ymax - item.boundingBox.ymin;
      } else {
        return;
      }

      const box = document.createElement("div");
      box.className = "streamsnap-bbox";
      box.style.top = `${topPct}%`;
      box.style.left = `${leftPct}%`;
      box.style.width = `${widthPct}%`;
      box.style.height = `${heightPct}%`;

      const displayLabel = item.detectionLabel || item.title?.slice(0, 30) || item.label || "Product";
      box.innerHTML = `<div class="streamsnap-bbox-tag">${item.badge} ${displayLabel}</div>`;

      box.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: "OPEN_SIDEPANEL" });
      });

      container.appendChild(box);
    });

    // Auto fade out bounding boxes after 7 seconds
    setTimeout(() => {
      container.querySelectorAll(".streamsnap-bbox").forEach((el) => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 400);
      });
    }, 7000);
  }


  function showToast(container, text) {
    const existing = container.querySelector(".streamsnap-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "streamsnap-toast";
    toast.innerHTML = `<span style="color:#FF9900;">⚡</span> ${text}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function getPresetItems(streamType) {
    const catalog = {
      tech_podcast: {
        exactMatches: [
          {
            asin: "B0002E4Z8M",
            title: "Shure SM7B Cardioid Dynamic Vocal Microphone",
            price: 399.00,
            image: "https://m.media-amazon.com/images/I/71P4q+HqKQL._AC_SL1500_.jpg",
            confidence: 0.98,
            detectionLabel: "Shure SM7B Mic",
            boundingBox: { ymin: 30, xmin: 38, ymax: 65, xmax: 60 }
          },
          {
            asin: "B08PZHYWJS",
            title: "Apple AirPods Max Wireless Over-Ear Headphones (Space Gray)",
            price: 549.00,
            image: "https://m.media-amazon.com/images/I/81jqUPkIVRL._AC_SL1500_.jpg",
            confidence: 0.99,
            detectionLabel: "AirPods Max",
            boundingBox: { ymin: 12, xmin: 42, ymax: 32, xmax: 58 }
          },
          {
            asin: "B07W755322",
            title: "Elgato Key Light — Professional 2800 Lumen Studio LED Panel",
            price: 199.99,
            image: "https://m.media-amazon.com/images/I/61LpX3fXQAL._AC_SL1500_.jpg",
            confidence: 0.94,
            detectionLabel: "Elgato Key Light",
            boundingBox: { ymin: 8, xmin: 75, ymax: 42, xmax: 95 }
          }
        ],
        lookAlikes: [
          {
            asin: "B09KND9W8Z",
            title: "Champion Men's Powerblend Fleece Oversized Hoodie (Vintage Olive)",
            price: 38.50,
            image: "https://m.media-amazon.com/images/I/71p0W+3XfUL._AC_UX679_.jpg",
            similarityScore: 92,
            detectionLabel: "Olive Green Hoodie",
            boundingBox: { ymin: 42, xmin: 25, ymax: 92, xmax: 75 }
          }
        ],
        unidentifiedRequests: [
          {
            id: "req_ceramic_mug_01",
            label: "Handmade Speckled Ceramic Mug",
            category: "Drinkware",
            reason: "Artisanal custom piece with no retail barcode",
            requestCount: 7,
            boundingBox: { ymin: 70, xmin: 18, ymax: 90, xmax: 35 }
          }
        ]
      },
      gaming_stream: {
        exactMatches: [
          {
            asin: "B09XS7JWHH",
            title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
            price: 348.00,
            image: "https://m.media-amazon.com/images/I/61vJtKbAssL._AC_SL1500_.jpg",
            confidence: 0.96,
            detectionLabel: "Sony WH-1000XM5",
            boundingBox: { ymin: 18, xmin: 44, ymax: 40, xmax: 56 }
          },
          {
            asin: "B07W5JK7B6",
            title: "Elgato Stream Deck MK.2 — 15 Macro Keys Controller",
            price: 149.99,
            image: "https://m.media-amazon.com/images/I/61B5UjF7pKL._AC_SL1500_.jpg",
            confidence: 0.97,
            detectionLabel: "Stream Deck MK.2",
            boundingBox: { ymin: 75, xmin: 65, ymax: 92, xmax: 82 }
          }
        ],
        lookAlikes: [
          {
            asin: "B08C7KGH71",
            title: "Govee RGBIC Smart Neon Rope Lights 10ft",
            price: 59.99,
            image: "https://m.media-amazon.com/images/I/71Y+PqK8aVL._AC_SL1500_.jpg",
            similarityScore: 89,
            detectionLabel: "RGB Neon Wall Light",
            boundingBox: { ymin: 5, xmin: 10, ymax: 35, xmax: 50 }
          },
          {
            asin: "B07W94RNVL",
            title: "Aothia Leather Desk Pad Protector (Dark Walnut)",
            price: 16.99,
            image: "https://m.media-amazon.com/images/I/71fL-7Lz1wL._AC_SL1500_.jpg",
            similarityScore: 94,
            detectionLabel: "Desk Mat",
            boundingBox: { ymin: 78, xmin: 25, ymax: 98, xmax: 75 }
          }
        ],
        unidentifiedRequests: []
      },
      lifestyle_haul: {
        exactMatches: [
          {
            asin: "B0B94ZDFM9",
            title: "Stanley Quencher H2.0 FlowState Tumbler 40oz",
            price: 45.00,
            image: "https://m.media-amazon.com/images/I/61vK+GvKxLL._AC_SL1500_.jpg",
            confidence: 0.95,
            detectionLabel: "Stanley Cup 40oz",
            boundingBox: { ymin: 50, xmin: 25, ymax: 85, xmax: 45 }
          }
        ],
        lookAlikes: [
          {
            asin: "B09KND9W8Z",
            title: "Champion Men's Powerblend Fleece Oversized Hoodie",
            price: 38.50,
            image: "https://m.media-amazon.com/images/I/71p0W+3XfUL._AC_UX679_.jpg",
            similarityScore: 92,
            detectionLabel: "Oversized Hoodie",
            boundingBox: { ymin: 30, xmin: 35, ymax: 80, xmax: 65 }
          }
        ],
        unidentifiedRequests: [
          {
            id: "req_gold_chain_02",
            label: "Layered Herringbone Gold Necklace",
            category: "Jewelry",
            reason: "Fine boutique jewelry piece without brand mark",
            requestCount: 14,
            boundingBox: { ymin: 40, xmin: 46, ymax: 55, xmax: 54 }
          }
        ]
      }
    };

    return catalog[streamType] || catalog.tech_podcast;
  }

  // Keyboard shortcut: Alt + S / Option + S (Mac compatible across all keyboard layouts with capture: true)
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.code === "KeyS" || e.key === "s" || e.key === "S" || e.key === "ד" || e.key === "ß")) {
      e.stopPropagation();
      const activeVideo = document.querySelector("video");
      const container = document.querySelector("#movie_player") || activeVideo?.parentElement;
      if (activeVideo && container) {
        triggerStreamScan(activeVideo, container);
      }
    }
  }, true);

  // Listen for trigger scan from Chrome toolbar icon or Auto-Scan timer
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "TRIGGER_SCAN") {
      const activeVideo = document.querySelector("video");
      const container = document.querySelector("#movie_player") || activeVideo?.parentElement;
      if (activeVideo && container) {
        triggerStreamScan(activeVideo, container, false);
      }
    }
    if (message.action === "TRIGGER_AUTO_SCAN") {
      const activeVideo = document.querySelector("video");
      const container = document.querySelector("#movie_player") || activeVideo?.parentElement;
      if (activeVideo && container && !activeVideo.paused) {
        triggerStreamScan(activeVideo, container, true); // silent auto-scan
      }
    }
  });


  // YouTube SPA navigation events
  window.addEventListener("yt-navigate-finish", () => setTimeout(initUniversalVideoHook, 400));
  window.addEventListener("yt-page-data-updated", () => setTimeout(initUniversalVideoHook, 400));
  window.addEventListener("load", () => setTimeout(initUniversalVideoHook, 500));

  // Observe DOM for newly loaded streaming players
  const observer = new MutationObserver(() => initUniversalVideoHook());
  observer.observe(document.body, { childList: true, subtree: true });

  // Periodic poll to guarantee button stays on YouTube player during state changes
  setInterval(initUniversalVideoHook, 1500);

  // Initial pass
  initUniversalVideoHook();
})();

