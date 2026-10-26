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

  console.log(
    "%c⚡ [StreamSnap AI] Active Build: v1.6.3 (2026-09-07 09:30 IDT) | Platform: " +
      window.location.hostname,
    "background: #131921; color: #FF9900; font-weight: bold; padding: 4px 8px; border: 1px solid #FF9900; border-radius: 4px;"
  );

  const hookedVideos = new WeakSet();
  let isLiveClickModeActive = false;
  const IS_TIKTOK = window.location.hostname.includes("tiktok.com");
  let scanInFlight = false;
  // Master on/off. Mirrors chrome.storage.local.extensionEnabled. When false,
  // the on-video controls are removed and scans are refused on the page too.
  let extensionEnabled = true;

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
      "h1[data-e2e='browse-video-desc']",
      "div[data-e2e='video-desc']",
      "span[data-e2e='video-desc']",
      "h1[data-e2e='video-title']",
      "[data-e2e='video-desc'] span"
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
      "a[data-e2e='browse-username']",
      "h3[data-e2e='video-author-uniqueid']",
      "span[data-e2e='video-author-uniqueid']",
      "a[data-e2e='video-author-avatar']",
      "[data-e2e='user-title']",
      "[data-e2e='video-author-uniqueid']"
    ];
    for (const selector of candidates) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }
    return "Live Streamer";
  }

  // -------------------------------------------------------------------------
  // Control injection & container resolution
  // -------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Video picking: the largest visible, playing <video> in the viewport.
  // Twitch keeps an ad / mini-player <video> inside the same container, and the
  // first <video> (old behaviour) was often that one: blank or tiny frames,
  // scans returning nothing, toasts drawn into an invisible box.
  // ---------------------------------------------------------------------------
  const AD_OR_MINI =
    '.video-ads, .ytp-ad-module, .ytp-ad-player-overlay, [class*="ad-banner"], [data-a-target*="ad"], [data-test-selector*="sda"], [class*="stream-display-ad"], [class*="picture-by-picture"], [class*="persistent-player--mini"], [class*="mini-player"], [class*="miniplayer"]';

  function videoScore(v) {
    if (!(v instanceof HTMLVideoElement)) return -1;
    if (v.closest(AD_OR_MINI)) return -1;
    const r = v.getBoundingClientRect();
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    if (w < 160 || h < 90) return -1;
    const cs = getComputedStyle(v);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.1) return -1;
    let score = w * h;
    if (!v.paused && v.readyState >= 2) score *= 4;
    else if (v.readyState < 2) score *= 0.25;
    return score;
  }

  function pickBestVideo(root = document) {
    let best = null;
    let bestScore = 0;
    for (const v of root.querySelectorAll("video")) {
      const sc = videoScore(v);
      if (sc > bestScore) {
        best = v;
        bestScore = sc;
      }
    }
    return best;
  }

  // Resolve the video at click time (inside this toolbar's container first).
  function resolvePlayer(fallbackVideo, fallbackContainer) {
    const inside = fallbackContainer ? pickBestVideo(fallbackContainer) : null;
    const video = inside || pickBestVideo() || fallbackVideo;
    const container = inside ? fallbackContainer : getPlayerContainer(video) || fallbackContainer;
    return { video, container };
  }

  function getPlayerContainer(video) {
    if (!video) return null;
    // 1. YouTube player shell
    const yt = video.closest("#movie_player, .html5-video-player");
    if (yt) return yt;
    // 2. TikTok Live & TikTok Feed: outermost video card, live room or web player
    const tiktok = video.closest(
      '[data-e2e="live-player-container"], [data-e2e="live-room"], [data-e2e="feed-video"], [class*="LiveRoom"], [class*="live-player"], [class*="LivePlayer"], [class*="DivVideoCardContainer"], [class*="DivVideoWrapper"], [class*="DivPlayerContainer"], [data-e2e="recommend-list-item-container"], .tiktok-web-player, .xgplayer'
    );
    if (tiktok) return tiktok;
    // 3. Twitch player
    const twitch = video.closest(
      ".video-player__container, .player-video, [data-a-target='video-player']"
    );
    if (twitch) return twitch;
    // 4. Kick player
    const kick = video.closest("#channel-player, .kick-player, [data-channel-player]");
    if (kick) return kick;
    // 5. Facebook Live
    const fb = video.closest("div[data-pagelet*='Video'], div[role='region'], div[role='main']");
    if (fb) return fb;
    return video.parentElement;
  }

  // Handlers routed through the document_start guard (content/guard.js), which
  // stops events on our UI at the window before the page sees them.
  function ssOn(node, type, fn) {
    if (window.__ssOn) window.__ssOn(node, type, fn);
    else node.addEventListener(type, fn); // guard missing: plain listener
  }

  function shieldInteractions(node) {
    if (!node) return;
    const events = [
      "mousedown",
      "mouseup",
      "pointerdown",
      "pointerup",
      "touchstart",
      "touchend",
      "click",
      "dblclick",
      "contextmenu"
    ];
    events.forEach((evtName) => {
      node.addEventListener(
        evtName,
        // Bubble phase + stopPropagation only. The previous capture-phase
        // stopImmediatePropagation() ran first at the target and cancelled the
        // button's own click handler, so Scan Frame / Snip Box did nothing.
        (e) => {
          e.stopPropagation();
        },
        false
      );
    });
  }

  function makeDraggable(element, handle, container) {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let isDragging = false;

    function onPointerDown(e) {
      if (e.target.closest("button") || e.target.closest(".streamsnap-control-btn")) {
        return;
      }
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = element.getBoundingClientRect();
      const parentRect = container.getBoundingClientRect();
      initialLeft = rect.left - parentRect.left;
      initialTop = rect.top - parentRect.top;

      element.style.right = "auto";
      element.style.left = `${initialLeft}px`;
      element.style.top = `${initialTop}px`;

      const onPointerMove = (moveEvent) => {
        if (!isDragging) return;
        moveEvent.stopPropagation();
        moveEvent.stopImmediatePropagation();
        moveEvent.preventDefault();

        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const pRect = container.getBoundingClientRect();
        const elRect = element.getBoundingClientRect();

        const maxLeft = Math.max(0, pRect.width - elRect.width);
        const maxTop = Math.max(0, pRect.height - elRect.height);

        const newLeft = Math.min(Math.max(4, initialLeft + dx), maxLeft - 4);
        const newTop = Math.min(Math.max(4, initialTop + dy), maxTop - 4);

        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
      };

      const onPointerUp = (upEvent) => {
        if (!isDragging) return;
        isDragging = false;
        upEvent.stopPropagation();
        upEvent.stopImmediatePropagation();
        document.removeEventListener("pointermove", onPointerMove, true);
        document.removeEventListener("pointerup", onPointerUp, true);
        element.classList.remove("is-dragging");
      };

      document.addEventListener("pointermove", onPointerMove, true);
      document.addEventListener("pointerup", onPointerUp, true);
      element.classList.add("is-dragging");
    }

    ssOn(handle, "pointerdown", onPointerDown);
  }

  function initUniversalVideoHook() {
    // TikTok is gated: its page swallows/redirects in-page clicks and its video
    // can't be read, so TikTok scans go through the side panel ("Scan Active
    // Stream", which can show the Allow prompt) or Alt+Shift+S.
    if (IS_TIKTOK) return;
    document.querySelectorAll("video").forEach((video) => {
      if (hookedVideos.has(video)) return;
      if (videoScore(video) < 0) return; // ads, mini-players, hidden/tiny: retry on next hook pass
      const container = getPlayerContainer(video);
      hookedVideos.add(video);
      attachStreamSnapControls(video, container);
    });

    injectYouTubeControlBarButton();
  }

  function createSvgIcon(name, size = 14) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.style.marginRight = "4px";
    svg.style.verticalAlign = "middle";

    const paths = {
      live: '<circle cx="12" cy="12" r="6" fill="currentColor"></circle>',
      snip: '<path d="M6 2v14a2 2 0 0 0 2 2h14"></path><path d="M18 22V8a2 2 0 0 0-2-2H2"></path>',
      scan: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>'
    };

    svg.innerHTML = paths[name] || paths.scan;
    return svg;
  }

  function attachStreamSnapControls(video, explicitContainer) {
    const parent = explicitContainer || video.parentElement;
    if (!parent || parent.querySelector(".streamsnap-btn-group")) return;

    if (window.getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    const isTikTok = window.location.hostname.includes("tiktok.com");
    const iconSize = isTikTok ? 16 : 14;
    const liveLabel = isTikTok ? "Live" : "Click-to-Find";
    const snipLabel = isTikTok ? "Snip" : "Snip Box";
    const scanLabel = isTikTok ? "Scan" : "Scan Frame";

    const btnGroup = el("div", "streamsnap-btn-group");
    if (isTikTok) {
      btnGroup.classList.add("streamsnap-tiktok-mode");
    }

    // 1. Minimized Pill (Shown when collapsed)
    const miniPill = el("div", "streamsnap-minimized-pill");
    miniPill.title = "StreamSnap AI v1.5.2 (31/08/2026 14:45) — Click to expand";
    miniPill.append(createSvgIcon("scan", 13), el("span", null, isTikTok ? "⚡ Snap" : "⚡ StreamSnap"));
    miniPill.style.display = "none";
    shieldInteractions(miniPill);

    // 2. Expanded Toolbar
    const expandedToolbar = el("div", "streamsnap-expanded-toolbar");

    const dragHandle = el("div", "streamsnap-drag-handle", "⋮⋮");
    dragHandle.title = "StreamSnap AI v1.5.2 (31/08/2026 14:45) — Drag toolbar (גרור לשינוי מיקום)";
    shieldInteractions(dragHandle);

    const liveBtn = el("button", "streamsnap-floating-btn streamsnap-live-btn");
    liveBtn.title = "Click-to-Find: click any object on the video to identify it";
    liveBtn.append(createSvgIcon("live", iconSize), el("span", null, liveLabel));
    shieldInteractions(liveBtn);

    // Click-to-Find uses a transparent overlay over the video (like Snip), so
    // the player never receives the click (no pause/freeze, no ignored first
    // click) and turning it off is just removing the overlay.
    let clickOverlay = null;
    let clickModeOn = false; // per player (TikTok feed has many)
    function setClickMode(on) {
      clickModeOn = on;
      isLiveClickModeActive = on;
      liveBtn.classList.toggle("active", on);
      liveBtn.replaceChildren(
        createSvgIcon("live", iconSize),
        el("span", null, on ? (isTikTok ? "Stop" : "Stop Click Mode") : liveLabel)
      );
      if (on && !clickOverlay) {
        clickOverlay = el("div", "streamsnap-click-overlay");
        clickOverlay.title = "Click any object to identify it";
        ssOn(clickOverlay, "click", (e) => {
          const rect = parent.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          showClickPulse(parent, clickX, clickY);
          const size = 180;
          const left = Math.max(0, clickX - size / 2);
          const top = Math.max(0, clickY - size / 2);
          const w = Math.min(rect.width - left, size);
          const h = Math.min(rect.height - top, size);
          showSelectionOutline(parent, left, top, w, h);
          cropAndSearch(parent, left, top, w, h);
        });
        parent.appendChild(clickOverlay);
      } else if (!on && clickOverlay) {
        clickOverlay.remove();
        clickOverlay = null;
      }
      showToast(parent, on ? "Click mode on — click any object on the video." : "Click mode off.");
    }

    ssOn(liveBtn, "click", (e) => {
      e.preventDefault();
      setClickMode(!clickModeOn);
    });

    const snipBtn = el("button", "streamsnap-floating-btn streamsnap-snip-btn");
    snipBtn.title = "Draw a box around any item to search for it";
    snipBtn.append(createSvgIcon("snip", iconSize), el("span", null, snipLabel));
    shieldInteractions(snipBtn);
    ssOn(snipBtn, "click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const p = resolvePlayer(video, parent);
      startInteractiveCropper(p.video, p.container);
    });

    const scanBtn = el("button", "streamsnap-floating-btn");
    scanBtn.title = "Scan the whole frame (Alt+Shift+S)";
    scanBtn.append(createSvgIcon("scan", iconSize), el("span", null, scanLabel));
    shieldInteractions(scanBtn);
    ssOn(scanBtn, "click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const p = resolvePlayer(video, parent);
      triggerStreamScan(p.video, p.container);
    });

    // 3. Minimize button (Collapse into small pill)
    const minimizeBtn = el("button", "streamsnap-control-btn minimize-btn");
    minimizeBtn.title = "Minimize buttons to a small pill (קבץ כפתורים)";
    minimizeBtn.innerHTML = "—";
    shieldInteractions(minimizeBtn);
    ssOn(minimizeBtn, "click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      expandedToolbar.style.display = "none";
      miniPill.style.display = "inline-flex";
      chrome.storage.local.set({ floatingControlsMinimized: true });
      showToast(parent, "Controls minimized — click ⚡ StreamSnap to expand.");
    });

    // 4. Hide button (Dismiss completely with restore dot)
    const hideBtn = el("button", "streamsnap-control-btn hide-btn");
    hideBtn.title = "Hide buttons from video (הסתר כפתורים מהווידאו)";
    hideBtn.innerHTML = "✕";
    shieldInteractions(hideBtn);
    ssOn(hideBtn, "click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      btnGroup.style.display = "none";
      hiddenDot.style.display = "block";
      chrome.storage.local.set({ floatingControlsHidden: true });
      showToast(parent, "Controls hidden — click top corner dot to restore.");
    });

    // Expand when clicking mini pill
    ssOn(miniPill, "click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      miniPill.style.display = "none";
      expandedToolbar.style.display = "flex";
      chrome.storage.local.set({ floatingControlsMinimized: false });
    });

    // Hidden restore dot
    const hiddenDot = el("div", "streamsnap-hidden-dot");
    if (isTikTok) {
      hiddenDot.classList.add("streamsnap-tiktok-dot");
    }
    hiddenDot.title = "Click to restore StreamSnap video controls (שחזר כפתורים)";
    hiddenDot.style.display = "none";
    shieldInteractions(hiddenDot);
    ssOn(hiddenDot, "click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      hiddenDot.style.display = "none";
      btnGroup.style.display = "flex";
      expandedToolbar.style.display = "flex";
      miniPill.style.display = "none";
      chrome.storage.local.set({ floatingControlsHidden: false, floatingControlsMinimized: false });
    });

    makeDraggable(btnGroup, dragHandle, parent);

    const controlRow = el("div", "streamsnap-control-row");
    controlRow.append(minimizeBtn, hideBtn);

    expandedToolbar.append(dragHandle, liveBtn, snipBtn, scanBtn, controlRow);
    btnGroup.append(miniPill, expandedToolbar);
    parent.append(btnGroup, hiddenDot);

    // Check stored display preferences
    chrome.storage.local.get(
      ["showFloatingControls", "floatingControlsMinimized", "floatingControlsHidden", "extensionEnabled"],
      (prefs = {}) => {
        if (prefs.extensionEnabled === false || prefs.showFloatingControls === false) {
          btnGroup.style.display = "none";
          hiddenDot.style.display = "none";
          return;
        }

        if (prefs.floatingControlsHidden) {
          btnGroup.style.display = "none";
          hiddenDot.style.display = "block";
        } else if (prefs.floatingControlsMinimized) {
          expandedToolbar.style.display = "none";
          miniPill.style.display = "inline-flex";
        }
      }
    );

    // Listen for setting changes in real time
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.showFloatingControls) {
        if (changes.showFloatingControls.newValue === false) {
          btnGroup.style.display = "none";
          hiddenDot.style.display = "none";
        } else {
          btnGroup.style.display = "flex";
          expandedToolbar.style.display = "flex";
          miniPill.style.display = "none";
          hiddenDot.style.display = "none";
        }
      }
    });

  }

  function injectYouTubeControlBarButton() {
    const controls = document.querySelector(".ytp-right-controls");
    if (!controls || controls.querySelector(".streamsnap-ytp-btn")) return;

    const video = document.querySelector("#movie_player video");
    const player = document.querySelector("#movie_player");
    if (!video || !player) return;

    const btn = el("button", "ytp-button streamsnap-ytp-btn");
    btn.title = "StreamSnap AI — snip an item on the video (Alt+Shift+S)";
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

  // Orange box left on the video while the selected region is being searched.
  function showSelectionOutline(container, left, top, width, height) {
    container.querySelectorAll(".streamsnap-selection-outline").forEach((n) => n.remove());
    const box = el("div", "streamsnap-selection-outline");
    Object.assign(box.style, {
      position: "absolute",
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      border: "2px solid #FF9900",
      borderRadius: "4px",
      boxShadow: "0 0 16px rgba(255,153,0,0.6)",
      pointerEvents: "none",
      zIndex: "2147483646"
    });
    container.appendChild(box);
    setTimeout(() => box.remove(), 4000);
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
    shieldInteractions(cropper);

    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;

    function teardown() {
      // The browser fires a click after mouseup on whatever is now under the
      // pointer: once the cropper is gone that's the <video>, which pauses
      // YouTube. Tell the guard to swallow that trailing click.
      window.__ssSwallowClickUntil = Date.now() + 600;
      cropper.remove();
      document.removeEventListener("keydown", handleKeyDown);
    }

    ssOn(closeBtn, "click", (e) => {
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
      showSelectionOutline(container, left, top, width, height);
      cropAndSearch(container, left, top, width, height);
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") teardown();
    }

    ssOn(cropper, "mousedown", handleMouseDown);
    cropper.addEventListener("mousemove", handleMouseMove, true);
    cropper.addEventListener("mouseup", handleMouseUp, true);
    document.addEventListener("keydown", handleKeyDown);
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  function cropFromScreenshot(screenshotDataUrl, rect) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const naturalW = img.naturalWidth || img.width;
          const naturalH = img.naturalHeight || img.height;
          const scaleX = naturalW / (window.innerWidth || 1);
          const scaleY = naturalH / (window.innerHeight || 1);

          const sx = Math.max(0, Math.round(rect.left * scaleX));
          const sy = Math.max(0, Math.round(rect.top * scaleY));
          const sw = Math.max(10, Math.min(naturalW - sx, Math.round(rect.width * scaleX)));
          const sh = Math.max(10, Math.min(naturalH - sy, Math.round(rect.height * scaleY)));

          const canvas = document.createElement("canvas");
          canvas.width = sw;
          canvas.height = sh;
          canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          canvas.width = 0;
          canvas.height = 0;
          resolve(dataUrl);
        } catch (err) {
          console.warn("[StreamSnap] crop failed:", err);
          resolve(screenshotDataUrl);
        }
      };
      img.onerror = () => resolve(screenshotDataUrl);
      img.src = screenshotDataUrl;
    });
  }

  // Crop straight from the <video> when the browser allows reading it
  // (YouTube/Twitch usually do). Returns null if tainted, blank or unavailable.
  function cropFromVideoElement(container, cropX, cropY, cropW, cropH) {
    try {
      const video = pickBestVideo(container) || container.querySelector("video");
      if (!video || video.readyState < 2 || !video.videoWidth) return null;
      const cRect = container.getBoundingClientRect();
      const vRect = video.getBoundingClientRect();
      // Account for letterboxing (object-fit: contain).
      const scale = Math.min(vRect.width / video.videoWidth, vRect.height / video.videoHeight);
      const drawnW = video.videoWidth * scale;
      const drawnH = video.videoHeight * scale;
      const offX = vRect.left - cRect.left + (vRect.width - drawnW) / 2;
      const offY = vRect.top - cRect.top + (vRect.height - drawnH) / 2;
      const sx = Math.max(0, (cropX - offX) / scale);
      const sy = Math.max(0, (cropY - offY) / scale);
      const sw = Math.min(video.videoWidth - sx, cropW / scale);
      const sh = Math.min(video.videoHeight - sy, cropH / scale);
      if (sw < 8 || sh < 8) return null;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      canvas.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      if (typeof isNonBlankCanvas === "function" && !isNonBlankCanvas(canvas)) return null;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      canvas.width = 0;
      canvas.height = 0;
      return dataUrl && dataUrl.length > 1000 ? dataUrl : null;
    } catch {
      return null; // tainted canvas -> screenshot fallback
    }
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

      // In-page clicks don't grant activeTab, so try the video element first
      // (same as the full-frame path); fall back to a tab screenshot.
      const directCrop = cropFromVideoElement(container, cropX, cropY, cropW, cropH);
      const capture = directCrop
        ? { dataUrl: null, direct: directCrop }
        : await sendMessage({ action: "CAPTURE_VISIBLE_TAB", interactive: true });
      if (!capture.dataUrl && !capture.direct) {
        chrome.storage.local.set({ isScanning: false });
        if (capture.needsCapturePermission) {
          sendMessage({ action: "OPEN_SIDEPANEL" });
          showPermissionToast(container);
        } else {
          showToast(container, `Screen capture failed: ${capture.error || "unknown error"}`, { error: true });
        }
        return;
      }

      const rect = container.getBoundingClientRect();
      const cropped = capture.direct || (await cropFromScreenshot(capture.dataUrl, {
        left: rect.left + cropX,
        top: rect.top + cropY,
        width: cropW,
        height: cropH
      }));

      // No hard sign-in gate: unsigned scans go to the server with the install ID
      // (small free daily cap). A personal Gemini key still runs locally.
      const { geminiApiKey } = await chrome.storage.local.get(["geminiApiKey"]);

      const res = await sendMessage({
        action: "ANALYZE_CROPPED_IMAGE",
        croppedImage: cropped,
        apiKey: geminiApiKey || null,
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
        showToast(container, `Server error: ${res?.error || "analysis failed"}`, { error: true });
      }
    } catch (err) {
      console.warn("[StreamSnap] scan failed:", err);
      chrome.storage.local.set({ isScanning: false });
      showToast(container, `Scan failed: ${err?.message || "unexpected error"}`, { error: true });
    } finally {
      scanInFlight = false;
    }
  }

  function isNonBlankCanvas(canvas) {
    try {
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      if (w <= 0 || h <= 0) return false;
      const sampleW = Math.min(80, Math.floor(w * 0.4));
      const sampleH = Math.min(80, Math.floor(h * 0.4));
      const sampleX = Math.floor((w - sampleW) / 2);
      const sampleY = Math.floor((h - sampleH) / 2);
      const sample = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
      const data = sample.data;
      let totalLuminance = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalLuminance += data[i] + data[i + 1] + data[i + 2];
      }
      const avg = totalLuminance / ((data.length / 4) * 3);
      return avg > 8; // Frame is not purely black/empty
    } catch {
      return false;
    }
  }

  let lastCaptureFailure = null;

  async function captureTargetVideoFrame(video, container) {
    lastCaptureFailure = null;
    // 1. Try burst sampling directly from the HTML5 video element (fastest & highest resolution)
    if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const maxW = 1280;
          const targetW = Math.min(maxW, video.videoWidth);
          const scale = targetW / video.videoWidth;
          const targetH = Math.round(video.videoHeight * scale);

          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, targetW, targetH);

          if (isNonBlankCanvas(canvas)) {
            const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
            canvas.width = 0;
            canvas.height = 0;
            if (dataUrl && dataUrl.length > 1000) return dataUrl;
          }
          canvas.width = 0;
          canvas.height = 0;
        } catch {
          // Tainted canvas (CORS/DRM protected video) — exit burst loop and fall through to screenshot
          break;
        }
        await new Promise((r) => setTimeout(r, 60));
      }
    }

    // 2. Fallback: viewport screenshot with precision scale alignment
    const capture = await sendMessage({ action: "CAPTURE_VISIBLE_TAB", interactive: true });
    if (!capture.dataUrl) {
      lastCaptureFailure = capture;
      return null;
    }

    const targetEl = video || container;
    const rect = targetEl.getBoundingClientRect();
    return cropFromScreenshot(capture.dataUrl, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    });
  }

  async function triggerStreamScan(video, container, isSilent = false) {
    if (!extensionEnabled) {
      if (!isSilent) showToast(container, "StreamSnap is OFF. Turn it on from the side panel to scan.");
      return;
    }
    if (scanInFlight) return;
    scanInFlight = true;

    try {
      if (!isSilent) {
        renderLaserScan(container);
        sendMessage({ action: "OPEN_SIDEPANEL" });
      }

      // No hard sign-in gate: unsigned scans go to the server with the install
      // ID; if the server asks for sign-in, the side panel shows it.
      const { geminiApiKey } = await chrome.storage.local.get(["geminiApiKey"]);

      chrome.storage.local.set({ isScanning: true });
      const streamTitle = getStreamTitle();
      if (!isSilent) showToast(container, `Scanning "${truncate(streamTitle, 30)}"…`);

      const image = await captureTargetVideoFrame(video, container);
      if (!image) {
        chrome.storage.local.set({ isScanning: false });
        if (!isSilent) {
          sendMessage({ action: "OPEN_SIDEPANEL" });
          if (lastCaptureFailure?.needsCapturePermission) showPermissionToast(container);
          else
            showToast(
              container,
              `Could not capture the video frame${lastCaptureFailure?.error ? `: ${lastCaptureFailure.error}` : " (video not readable)."}`,
              { error: true }
            );
        }
        return;
      }

      const res = await sendMessage({
        action: "ANALYZE_WITH_AI",
        imageBase64: image,
        apiKey: geminiApiKey || null,
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
      } else if (res?.authRequired) {
        sendMessage({ action: "OPEN_SIDEPANEL" });
        if (!isSilent) showToast(container, "Free scan limit reached: sign in from the StreamSnap panel to keep scanning.", { error: true });
      } else if (!isSilent) {
        showToast(container, `Server error: ${res?.error || "scan failed"}`, { error: true });
      } else {
        console.warn("[StreamSnap] auto-scan failed:", res?.error);
      }
    } catch (err) {
      console.warn("[StreamSnap] scan failed:", err);
      chrome.storage.local.set({ isScanning: false });
      showToast(container, `Scan failed: ${err?.message || "unexpected error"}`, { error: true });
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

  // Toasts must always be visible: if the container is hidden/off-screen (e.g.
  // a Twitch mini-player), fall back to a fixed toast on the page.
  // The Allow tab takes focus, so a normal toast expires unseen. Show it
  // sticky now AND again when the user comes back to this tab.
  const PERM_TOAST =
    "Screen-capture permission needed: click Allow in the StreamSnap tab that opened, then scan again.";
  let pendingPermToast = null;
  function showPermissionToast(container) {
    pendingPermToast = container;
    showToast(container, PERM_TOAST, { error: true, sticky: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !pendingPermToast) return;
    const c = pendingPermToast;
    pendingPermToast = null;
    showToast(c, "If you clicked Allow, scan again now. Otherwise screen capture is still blocked.", { sticky: true });
  });

  function showToast(container, text, { error = false, sticky = false } = {}) {
    if (error) console.warn("[StreamSnap]", text);
    let host = container;
    const r = container?.getBoundingClientRect?.();
    const visible =
      r && r.width >= 200 && r.height >= 80 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    if (!visible) host = document.body;
    document.querySelectorAll(".streamsnap-toast").forEach((t) => t.remove());
    const toast = el("div", "streamsnap-toast");
    if (host === document.body) {
      Object.assign(toast.style, { position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483647" });
    }
    if (error) toast.style.borderColor = "#ef4444";
    const bolt = el("span", null, error ? "⚠️" : "⚡");
    bolt.style.color = "#FF9900";
    toast.append(bolt, el("span", null, text));
    host.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, sticky ? 15000 : error ? 6000 : 3500);
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  function getActivePlayer() {
    const video = pickBestVideo() || document.querySelector("#movie_player video");
    if (!video) return null;
    const container = getPlayerContainer(video);
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
    if (!extensionEnabled) return; // off means off, whatever asks
    if (message.action === "SHOW_TOAST") {
      const p = getActivePlayer();
      showToast(p?.container || document.body, message.text, { error: !!message.error, sticky: !!message.error });
    }
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

  // -------------------------------------------------------------------------
  // Master on/off guard
  //
  // When the extension is switched off, strip every injected control from the
  // page and drop a small, unobtrusive "OFF" pill so the state is visible on
  // the video itself — not just in the side panel. Switching back on re-injects.
  // -------------------------------------------------------------------------

  function showGuardPill() {
    if (document.querySelector(".streamsnap-guard-pill")) return;
    const pill = el("div", "streamsnap-guard-pill");
    pill.textContent = "⚡ StreamSnap is OFF";
    pill.title = "StreamSnap is disabled. Open the side panel to turn it back on.";
    Object.assign(pill.style, {
      position: "fixed",
      bottom: "18px",
      left: "18px",
      zIndex: "2147483646",
      background: "rgba(9,13,20,0.92)",
      color: "#F59E0B",
      border: "1px solid rgba(245,158,11,0.5)",
      borderRadius: "999px",
      padding: "7px 14px",
      fontSize: "12px",
      fontWeight: "700",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
      pointerEvents: "none",
      backdropFilter: "blur(4px)"
    });
    document.body.appendChild(pill);
  }

  function removeGuardPill() {
    document.querySelector(".streamsnap-guard-pill")?.remove();
  }

  function applyEnabledState(enabled) {
    extensionEnabled = enabled;
    if (enabled) {
      removeGuardPill();
      // Re-inject controls that were stripped while off.
      initUniversalVideoHook();
    } else {
      // Remove all injected controls and restore dots.
      document
        .querySelectorAll(".streamsnap-btn-group, .streamsnap-hidden-dot")
        .forEach((node) => node.remove());
      showGuardPill();
    }
  }

  chrome.storage.local.get(["extensionEnabled"], (res = {}) => {
    if (res.extensionEnabled === false) applyEnabledState(false);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.extensionEnabled) {
      applyEnabledState(changes.extensionEnabled.newValue !== false);
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
