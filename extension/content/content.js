/**
 * StreamSnap AI — Video Content Script
 * Injects capture controls on YouTube, Twitch, TikTok, Facebook Live and Kick.
 *
 * Performance note: the previous version ran a full querySelectorAll on every
 * DOM mutation plus a 1.5s polling interval. On a YouTube watch page that is
 * thousands of scans per second. This version debounces mutations, backs off
 * when nothing changes, and disconnects when the page is hidden.
 */

(function () {
  "use strict";

  const hookedVideos = new WeakSet();
  let isLiveClickModeActive = false;
  let scanInFlight = false;

  // -------------------------------------------------------------------------
  // Safe DOM helpers — never interpolate page or model text into innerHTML.
  // -------------------------------------------------------------------------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function truncate(value, max) {
    const str = String(value ?? "");
    return str.length > max ? `${str.slice(0, max)}…` : str;
  }

  // -------------------------------------------------------------------------
  // Stream metadata
  // -------------------------------------------------------------------------

  function getStreamTitle() {
    const candidates = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "h2[data-a-target='stream-title']",
      "h1[data-e2e='browse-video-desc']"
    ];
    for (const selector of candidates) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }
    return document.title;
  }

  function getChannelName() {
    const candidates = [
      "#channel-name yt-formatted-string",
      "h1[data-a-target='user-channel-name']",
      "a[data-e2e='browse-username']"
    ];
    for (const selector of candidates) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }
    return "Live Streamer";
  }

  // -------------------------------------------------------------------------
  // Control injection
  // -------------------------------------------------------------------------

  function initUniversalVideoHook() {
    document.querySelectorAll("video").forEach((video) => {
      if (hookedVideos.has(video)) return;
      // Prefer the site's player shell so controls sit above the video chrome.
      const ytPlayer = video.closest("#movie_player, .html5-video-player");
      hookedVideos.add(video);
      attachStreamSnapControls(video, ytPlayer);
    });

    injectYouTubeControlBarButton();
  }

  function attachStreamSnapControls(video, explicitContainer) {
    const parent = explicitContainer || video.parentElement;
    if (!parent || parent.querySelector(".streamsnap-btn-group")) return;

    if (window.getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    const btnGroup = el("div", "streamsnap-btn-group");

    const liveBtn = el("button", "streamsnap-floating-btn streamsnap-live-btn");
    liveBtn.title = "Click-to-Find: click any object on the video to identify it";
    // Two flex children; .streamsnap-floating-btn supplies the gap, so no
    // leading whitespace in the labels.
    liveBtn.append(el("span", null, "🟢"), el("span", null, "Click-to-Find"));

    liveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      isLiveClickModeActive = !isLiveClickModeActive;
      liveBtn.classList.toggle("active", isLiveClickModeActive);
      liveBtn.replaceChildren(
        el("span", null, isLiveClickModeActive ? "🔴" : "🟢"),
        el("span", null, isLiveClickModeActive ? "Click Anything Live" : "Click-to-Find")
      );
      showToast(
        parent,
        isLiveClickModeActive
          ? "Click mode on — click any object on the video."
          : "Click mode off."
      );
    });

    const snipBtn = el("button", "streamsnap-floating-btn streamsnap-snip-btn");
    snipBtn.title = "Draw a box around any item to search for it";
    snipBtn.append(el("span", null, "🎯"), el("span", null, "Snip Box"));
    snipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      startInteractiveCropper(video, parent);
    });

    const scanBtn = el("button", "streamsnap-floating-btn");
    scanBtn.title = "Scan the whole frame (Alt+S)";
    scanBtn.append(el("span", "streamsnap-bolt", "⚡"), el("span", null, "Scan Frame"));
    scanBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      triggerStreamScan(video, parent);
    });

    btnGroup.append(liveBtn, snipBtn, scanBtn);
    parent.appendChild(btnGroup);

    parent.addEventListener(
      "click",
      (e) => {
        if (!isLiveClickModeActive) return;
        if (
          e.target.closest(".streamsnap-btn-group") ||
          e.target.closest(".streamsnap-toast") ||
          e.target.closest(".ytp-chrome-bottom")
        ) {
          return;
        }

        e.stopPropagation();
        const rect = parent.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        showClickPulse(parent, clickX, clickY);

        const size = 180;
        const left = Math.max(0, clickX - size / 2);
        const top = Math.max(0, clickY - size / 2);
        cropAndSearch(
          parent,
          left,
          top,
          Math.min(rect.width - left, size),
          Math.min(rect.height - top, size)
        );
      },
      true
    );
  }

  function injectYouTubeControlBarButton() {
    const controls = document.querySelector(".ytp-right-controls");
    if (!controls || controls.querySelector(".streamsnap-ytp-btn")) return;

    const video = document.querySelector("#movie_player video");
    const player = document.querySelector("#movie_player");
    if (!video || !player) return;

    const btn = el("button", "ytp-button streamsnap-ytp-btn");
    btn.title = "StreamSnap AI — snip an item on the video (Alt+S)";
    const icon = el("span", null, "🎯");
    icon.style.cssText = "font-size:16px;color:#FF9900;line-height:36px;display:inline-block;";
    btn.appendChild(icon);
    btn.style.textAlign = "center";
    btn.style.cursor = "pointer";

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      startInteractiveCropper(video, player);
    });

    controls.prepend(btn);
  }

  // -------------------------------------------------------------------------
  // Selection UI
  // -------------------------------------------------------------------------

  function showClickPulse(container, x, y) {
    const pulse = el("div", "streamsnap-click-pulse");
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    container.appendChild(pulse);
    setTimeout(() => pulse.remove(), 1300);
  }

  function startInteractiveCropper(video, container) {
    const existing = container.querySelector(".streamsnap-interactive-cropper");
    if (existing) {
      existing.remove();
      return;
    }

    const cropper = el("div", "streamsnap-interactive-cropper");
    const banner = el("div", "streamsnap-cropper-banner");
    banner.append(el("span", null, "🎯 Click or drag over any object to find it"));
    const closeBtn = el("button", "streamsnap-cropper-close-btn", "✕");
    closeBtn.title = "Close (Esc)";
    banner.appendChild(closeBtn);

    const selection = el("div", "streamsnap-cropper-selection");
    selection.style.display = "none";
    cropper.append(banner, selection);
    container.appendChild(cropper);

    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;

    function teardown() {
      cropper.remove();
      document.removeEventListener("keydown", handleKeyDown);
    }

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      teardown();
    });

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
      Object.assign(selection.style, {
        left: `${startX}px`,
        top: `${startY}px`,
        width: "0px",
        height: "0px",
        display: "block"
      });
    }

    function handleMouseMove(e) {
      if (!isDrawing) return;
      e.stopPropagation();
      const rect = cropper.getBoundingClientRect();
      endX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      endY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      Object.assign(selection.style, {
        left: `${Math.min(startX, endX)}px`,
        top: `${Math.min(startY, endY)}px`,
        width: `${Math.abs(endX - startX)}px`,
        height: `${Math.abs(endY - startY)}px`
      });
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

      // A plain click (no drag) becomes a centered box.
      if (width < 20 || height < 20) {
        const size = 160;
        left = Math.max(0, startX - size / 2);
        top = Math.max(0, startY - size / 2);
        width = Math.min(rect.width - left, size);
        height = Math.min(rect.height - top, size);
      }

      showClickPulse(container, left + width / 2, top + height / 2);
      teardown();
      cropAndSearch(container, left, top, width, height);
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") teardown();
    }

    cropper.addEventListener("mousedown", handleMouseDown, true);
    cropper.addEventListener("mousemove", handleMouseMove, true);
    cropper.addEventListener("mouseup", handleMouseUp, true);
    document.addEventListener("keydown", handleKeyDown);
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  function cropFromScreenshot(screenshotDataUrl, x, y, width, height) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width));
          canvas.height = Math.max(1, Math.round(height));
          canvas.getContext("2d").drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        } catch (err) {
          console.warn("[StreamSnap] crop failed:", err);
          resolve(screenshotDataUrl);
        }
      };
      img.onerror = () => resolve(screenshotDataUrl);
      img.src = screenshotDataUrl;
    });
  }

  function sendMessage(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || {});
        });
      } catch (err) {
        resolve({ error: err?.message || "Extension context unavailable" });
      }
    });
  }

  async function cropAndSearch(container, cropX, cropY, cropW, cropH) {
    if (scanInFlight) {
      showToast(container, "A scan is already running…");
      return;
    }
    scanInFlight = true;

    try {
      sendMessage({ action: "OPEN_SIDEPANEL" });
      chrome.storage.local.set({ isScanning: true });
      showToast(container, "Slicing selection and analyzing…");

      const capture = await sendMessage({ action: "CAPTURE_VISIBLE_TAB" });
      if (!capture.dataUrl) {
        chrome.storage.local.set({ isScanning: false });
        showToast(container, `Screen capture failed: ${capture.error || "unknown error"}`);
        return;
      }

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cropped = await cropFromScreenshot(
        capture.dataUrl,
        (rect.left + cropX) * dpr,
        (rect.top + cropY) * dpr,
        cropW * dpr,
        cropH * dpr
      );

      const { geminiApiKey } = await chrome.storage.local.get(["geminiApiKey"]);
      if (!geminiApiKey) {
        chrome.storage.local.set({ isScanning: false });
        showToast(container, "Add your Gemini API key in the Setup tab first.");
        return;
      }

      const res = await sendMessage({
        action: "ANALYZE_CROPPED_IMAGE",
        croppedImage: cropped,
        apiKey: geminiApiKey,
        streamContext: { title: getStreamTitle() }
      });

      if (res?.success) {
        const count = res.data?.matchCount || 0;
        showToast(
          container,
          count > 0
            ? `Found ${count} match${count === 1 ? "" : "es"} — see the side panel.`
            : "No confident match for that selection. Try a tighter crop."
        );
      } else {
        showToast(container, res?.error || "Analysis failed.");
      }
    } finally {
      scanInFlight = false;
    }
  }

  async function captureTargetVideoFrame(video, container) {
    // Fast path: draw the video element straight to a canvas. Fails on
    // cross-origin media, in which case we fall back to a cropped screenshot.
    try {
      if (video?.videoWidth > 0 && video?.videoHeight > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        if (dataUrl && dataUrl.length > 500) return dataUrl;
      }
    } catch {
      // Tainted canvas — expected on DRM/cross-origin video.
    }

    const capture = await sendMessage({ action: "CAPTURE_VISIBLE_TAB" });
    if (!capture.dataUrl) return null;

    const rect = (video || container).getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return cropFromScreenshot(
      capture.dataUrl,
      Math.max(0, rect.left * dpr),
      Math.max(0, rect.top * dpr),
      Math.max(10, rect.width * dpr),
      Math.max(10, rect.height * dpr)
    );
  }

  async function triggerStreamScan(video, container, isSilent = false) {
    if (scanInFlight) return;
    scanInFlight = true;

    try {
      if (!isSilent) {
        renderLaserScan(container);
        sendMessage({ action: "OPEN_SIDEPANEL" });
      }

      const { geminiApiKey } = await chrome.storage.local.get(["geminiApiKey"]);
      if (!geminiApiKey) {
        if (!isSilent) showToast(container, "Add your Gemini API key in the Setup tab first.");
        return;
      }

      chrome.storage.local.set({ isScanning: true });
      const streamTitle = getStreamTitle();
      if (!isSilent) showToast(container, `Scanning "${truncate(streamTitle, 30)}"…`);

      const image = await captureTargetVideoFrame(video, container);
      if (!image) {
        chrome.storage.local.set({ isScanning: false });
        if (!isSilent) showToast(container, "Could not capture the video frame.");
        return;
      }

      const res = await sendMessage({
        action: "ANALYZE_WITH_AI",
        imageBase64: image,
        apiKey: geminiApiKey,
        streamContext: { title: streamTitle, channel: getChannelName() }
      });

      if (res?.success && res.data) {
        renderBoundingBoxes(container, res.data.items);
        if (!isSilent) {
          const count = res.data.matchCount || 0;
          showToast(
            container,
            count > 0
              ? `${count} product${count === 1 ? "" : "s"} identified.`
              : "Nothing matched above your confidence threshold."
          );
        }
      } else if (!isSilent) {
        showToast(container, res?.error || "Scan failed.");
      }
    } finally {
      scanInFlight = false;
    }
  }

  // -------------------------------------------------------------------------
  // Overlays
  // -------------------------------------------------------------------------

  function renderLaserScan(container) {
    container.querySelector(".streamsnap-scan-overlay")?.remove();
    const overlay = el("div", "streamsnap-scan-overlay");
    overlay.appendChild(el("div", "streamsnap-scan-laser"));
    container.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2200);
  }

  function renderBoundingBoxes(container, results) {
    if (!results) return;
    container.querySelectorAll(".streamsnap-bbox").forEach((node) => node.remove());

    const items = [
      ...(results.exactMatches || []).map((m) => ({ ...m, badge: "🟢" })),
      ...(results.lookAlikes || []).map((m) => ({ ...m, badge: "🟡" }))
    ];

    for (const item of items) {
      const box = item.box_2d;
      if (!Array.isArray(box) || box.length < 4) continue;
      const [ymin, xmin, ymax, xmax] = box.map(Number);
      if (![ymin, xmin, ymax, xmax].every(Number.isFinite)) continue;

      const node = el("div", "streamsnap-bbox");
      node.style.top = `${ymin / 10}%`;
      node.style.left = `${xmin / 10}%`;
      node.style.width = `${Math.max(4, (xmax - xmin) / 10)}%`;
      node.style.height = `${Math.max(4, (ymax - ymin) / 10)}%`;

      const label = truncate(item.detectionLabel || item.title || "Product", 34);
      // textContent, not innerHTML — this string comes from the model.
      node.appendChild(el("div", "streamsnap-bbox-tag", `${item.badge} ${label}`));
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        sendMessage({ action: "OPEN_SIDEPANEL" });
      });

      container.appendChild(node);
    }

    setTimeout(() => {
      container.querySelectorAll(".streamsnap-bbox").forEach((node) => {
        node.style.opacity = "0";
        setTimeout(() => node.remove(), 400);
      });
    }, 7000);
  }

  function showToast(container, text) {
    container.querySelector(".streamsnap-toast")?.remove();
    const toast = el("div", "streamsnap-toast");
    const bolt = el("span", null, "⚡");
    bolt.style.color = "#FF9900";
    // textContent for the message — it can contain a page title or API error.
    // .streamsnap-toast is flex with a gap, so no leading whitespace.
    toast.append(bolt, el("span", null, text));
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  function getActivePlayer() {
    const video =
      document.querySelector("#movie_player video") || document.querySelector("video");
    if (!video) return null;
    const container = video.closest("#movie_player, .html5-video-player") || video.parentElement;
    return container ? { video, container } : null;
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      // e.code is layout-independent, so this works on non-Latin keyboards.
      if (e.code !== "KeyS") return;
      const player = getActivePlayer();
      if (!player) return;
      e.stopPropagation();
      triggerStreamScan(player.video, player.container);
    },
    true
  );

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "TRIGGER_SCAN") {
      const player = getActivePlayer();
      if (player) triggerStreamScan(player.video, player.container, false);
    }
    if (message.action === "TRIGGER_AUTO_SCAN") {
      const player = getActivePlayer();
      // Skip paused video and backgrounded tabs — nothing new to see.
      if (player && !player.video.paused && document.visibilityState === "visible") {
        triggerStreamScan(player.video, player.container, true);
      }
    }
  });

  // Debounced mutation handling. The old version called querySelectorAll on
  // every mutation record, which on YouTube is a continuous main-thread stall.
  let rafHandle = null;
  let debounceTimer = null;

  function scheduleHook() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        if (document.visibilityState === "visible") initUniversalVideoHook();
      });
    }, 400);
  }

  const observer = new MutationObserver(scheduleHook);
  observer.observe(document.body, { childList: true, subtree: true });

  // SPA navigation on YouTube does not reload the page.
  window.addEventListener("yt-navigate-finish", scheduleHook);
  window.addEventListener("yt-page-data-updated", scheduleHook);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleHook();
  });

  window.addEventListener("pagehide", () => {
    observer.disconnect();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (rafHandle) cancelAnimationFrame(rafHandle);
  });

  initUniversalVideoHook();
})();
