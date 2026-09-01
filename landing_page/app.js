/**
 * StreamSnap AI — Studio Telemetry Interactive Engine
 * Aesthetic: Cyber-Cinematic / Optical Commerce HUD
 */

// Official Chrome Web Store URL
const CHROME_STORE_URL = "https://chromewebstore.google.com/detail/streamsnap-ai-%E2%80%94-live-stre/efbfecbochblmakpdllbnpdgkmmfmmel";

let lenisInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  initLenis();
  initCustomCursor();
  initHeroInteractive();
  initScrollTransformation();
  initSimulator();
  initCalculator();
  initModals();
  initFAQ();
});

function initLenis() {
  if (typeof Lenis !== "undefined") {
    lenisInstance = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.05
    });

    function raf(time) {
      lenisInstance.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }
}

// 3D Scroll Transformation Concept (Scroll-Experience)
function initScrollTransformation() {
  const track = document.getElementById("scroll-story-track");
  const terminal = document.getElementById("scroll-transform-terminal");
  const laser = document.getElementById("scroll-laser-sweep");
  const boxMic = document.getElementById("target-box-mic");
  const boxLight = document.getElementById("target-box-light");
  const boxHoodie = document.getElementById("target-box-hoodie");
  const cardShure = document.getElementById("card-shure");
  const cardElgato = document.getElementById("card-elgato");
  const cardChampion = document.getElementById("card-champion");
  const ms1 = document.getElementById("ms-1");
  const ms2 = document.getElementById("ms-2");
  const ms3 = document.getElementById("ms-3");
  const badge = document.getElementById("scroll-phase-badge");
  const caption = document.getElementById("scroll-caption-text");

  if (!track || !terminal) return;

  function onScroll() {
    const rect = track.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const totalDistance = rect.height - windowHeight;

    if (totalDistance <= 0) return;

    // Progress from 0.0 to 1.0 within the sticky track
    const progress = Math.max(0, Math.min(1, -rect.top / totalDistance));

    // Milestone & Phase Updates
    if (progress < 0.33) {
      // Phase 1: Raw Broadcast & Perspective Tilt
      const p = progress / 0.33;
      const rotX = 14 * (1 - p);
      const rotY = -4 * (1 - p);
      const sc = 0.88 + 0.12 * p;
      terminal.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      
      if (laser) laser.style.opacity = "0";
      if (boxMic) boxMic.style.opacity = "0";
      if (boxLight) boxLight.style.opacity = "0";
      if (boxHoodie) boxHoodie.style.opacity = "0";
      
      if (cardShure) { cardShure.style.opacity = "0"; cardShure.style.transform = "translateY(50px) translateZ(80px) scale(0.85)"; }
      if (cardElgato) { cardElgato.style.opacity = "0"; cardElgato.style.transform = "translateY(50px) translateZ(100px) scale(0.85)"; }
      if (cardChampion) { cardChampion.style.opacity = "0"; cardChampion.style.transform = "translateY(50px) translateZ(80px) scale(0.85)"; }

      if (ms1) ms1.classList.add("active");
      if (ms2) ms2.classList.remove("active");
      if (ms3) ms3.classList.remove("active");
      if (badge) badge.textContent = "[ PHASE 01 // PASSIVE STREAM ]";
      if (caption) caption.textContent = "You are watching a broadcast — scroll down to activate AI optical telemetry";

    } else if (progress < 0.68) {
      // Phase 2: Laser Optical Scan & Target Bounding Boxes Lock
      const p = (progress - 0.33) / 0.35;
      terminal.style.transform = `rotateX(0deg) rotateY(0deg) scale(1.0)`;

      if (laser) {
        laser.style.opacity = "1";
        laser.style.top = `${(p * 92).toFixed(1)}%`;
      }

      const micVisible = p > 0.2 ? "1" : "0";
      const lightVisible = p > 0.4 ? "1" : "0";
      const hoodieVisible = p > 0.6 ? "1" : "0";

      if (boxMic) boxMic.style.opacity = micVisible;
      if (boxLight) boxLight.style.opacity = lightVisible;
      if (boxHoodie) boxHoodie.style.opacity = hoodieVisible;

      if (cardShure) cardShure.style.opacity = "0";
      if (cardElgato) cardElgato.style.opacity = "0";
      if (cardChampion) cardChampion.style.opacity = "0";

      if (ms1) ms1.classList.remove("active");
      if (ms2) ms2.classList.add("active");
      if (ms3) ms3.classList.remove("active");
      if (badge) badge.textContent = "[ PHASE 02 // MULTI-OBJECT AI LOCK ]";
      if (caption) caption.textContent = "Optical recognition lock achieved in <1.8s · Catalog ASINs resolved";

    } else {
      // Phase 3: 3D Product Extraction & 1-Click Amazon Cart
      const p = (progress - 0.68) / 0.32;
      terminal.style.transform = `rotateX(4deg) scale(0.98)`;

      if (laser) laser.style.opacity = "0";
      if (boxMic) boxMic.style.opacity = "0.2";
      if (boxLight) boxLight.style.opacity = "0.2";
      if (boxHoodie) boxHoodie.style.opacity = "0.2";

      const cardProgress = Math.min(1, p * 1.5);
      if (cardShure) {
        cardShure.style.opacity = `${cardProgress}`;
        cardShure.style.transform = `translateY(${(20 * (1 - cardProgress)).toFixed(1)}px) translateZ(90px) rotateY(-6deg) scale(${0.85 + 0.15 * cardProgress})`;
      }
      if (cardElgato) {
        cardElgato.style.opacity = `${cardProgress}`;
        cardElgato.style.transform = `translateY(${(20 * (1 - cardProgress)).toFixed(1)}px) translateZ(110px) scale(${0.85 + 0.15 * cardProgress})`;
      }
      if (cardChampion) {
        cardChampion.style.opacity = `${cardProgress}`;
        cardChampion.style.transform = `translateY(${(20 * (1 - cardProgress)).toFixed(1)}px) translateZ(90px) rotateY(6deg) scale(${0.85 + 0.15 * cardProgress})`;
      }

      if (ms1) ms1.classList.remove("active");
      if (ms2) ms2.classList.remove("active");
      if (ms3) ms3.classList.add("active");
      if (badge) badge.textContent = "[ PHASE 03 // 1-CLICK AMAZON CART ]";
      if (caption) caption.textContent = "3 verified products extracted and staged directly for official Amazon checkout";
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// Custom Magnetic Cursor
function initCustomCursor() {
  const cursor = document.getElementById("custom-cursor");
  const dot = document.getElementById("custom-cursor-dot");
  if (!cursor || !dot) return;

  let mouseX = 0, mouseY = 0;
  let cursorX = 0, cursorY = 0;

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
  });

  function renderCursor() {
    cursorX += (mouseX - cursorX) * 0.18;
    cursorY += (mouseY - cursorY) * 0.18;
    cursor.style.transform = `translate(${cursorX}px, ${cursorY}px) translate(-50%, -50%)`;
    requestAnimationFrame(renderCursor);
  }
  renderCursor();

  // Hover states for interactive elements
  const hoverables = document.querySelectorAll("button, a, .interactive-stage-spot, .sim-hotspot, .channel-tab, input[type='range']");
  hoverables.forEach((el) => {
    el.addEventListener("mouseenter", () => {
      cursor.style.width = "48px";
      cursor.style.height = "48px";
      cursor.style.borderColor = "#00F0FF";
      cursor.style.backgroundColor = "rgba(0, 240, 255, 0.08)";
    });
    el.addEventListener("mouseleave", () => {
      cursor.style.width = "32px";
      cursor.style.height = "32px";
      cursor.style.borderColor = "#FF9900";
      cursor.style.backgroundColor = "transparent";
    });
  });
}

// Hero Stage Interactive Telemetry HUD
function initHeroInteractive() {
  const spots = document.querySelectorAll(".interactive-stage-spot");
  const box = document.getElementById("hero-bounding-box");
  const heroCard = document.getElementById("hero-detection-card");
  const heroImg = document.getElementById("hero-card-img");
  const heroTitle = document.getElementById("hero-card-title");
  const heroPrice = document.getElementById("hero-card-price");
  const heroBuy = document.getElementById("hero-card-buy");

  const heroData = {
    jersey: {
      title: "PUMA Men's AC Milan 2023/24 Home Replica Soccer Jersey (MSC & Emirates)",
      price: "$89.99",
      asin: "B0CBVR3M9T",
      box: { top: "44%", left: "48%", width: "140px", height: "180px" },
      label: "AC_MILAN_PUMA_JERSEY",
      conf: "99.4%",
      img: "assets/products/ac_milan_jersey.png",
      link: "https://www.amazon.com/s?k=PUMA+AC+Milan+2023%2F24+Home+Jersey&tag=streamsnap03-20"
    },
    cap: {
      title: "New Era Los Angeles Angels Black On Black 9FIFTY Snapback Cap",
      price: "$34.99",
      asin: "B079M7G65L",
      box: { top: "24%", left: "62%", width: "100px", height: "90px" },
      label: "LA_ANGELS_SNAPBACK",
      conf: "98.7%",
      img: "assets/products/angels_cap.png",
      link: "https://www.amazon.com/s?k=Angels+Snapback+Cap+Black&tag=streamsnap03-20"
    },
    tee: {
      title: "Gildan Ultra Cotton Adult T-Shirt (Classic White Heavyweight)",
      price: "$18.50",
      asin: "B0762M89L4",
      box: { top: "42%", left: "36%", width: "110px", height: "140px" },
      label: "CREWNECK_WHITE_TEE",
      conf: "97.1%",
      img: "assets/products/white_tee.png",
      link: "https://www.amazon.com/s?k=White+Crewneck+T-Shirt+Men&tag=streamsnap03-20"
    }
  };

  spots.forEach((spot) => {
    spot.addEventListener("click", () => {
      spots.forEach((s) => s.classList.remove("active"));
      spot.classList.add("active");

      const key = spot.dataset.item;
      const data = heroData[key];
      if (!data) return;

      // Update Bounding Box Telemetry
      if (box) {
        box.style.top = data.box.top;
        box.style.left = data.box.left;
        box.style.width = data.box.width;
        box.style.height = data.box.height;
        const nameEl = box.querySelector(".target-name");
        const confEl = box.querySelector(".target-conf");
        if (nameEl) nameEl.textContent = data.label;
        if (confEl) confEl.textContent = data.conf;
      }

      // Update Drawer
      if (heroImg) heroImg.src = data.img;
      if (heroTitle) heroTitle.textContent = data.title;
      if (heroPrice) heroPrice.textContent = data.price;
      if (heroBuy) heroBuy.href = data.link;

      if (heroCard) {
        heroCard.style.animation = "none";
        void heroCard.offsetWidth; // reflow
        heroCard.style.animation = "modal-pop-in 0.25s ease-out";
      }
    });
  });
}

// Quota Management for Live Demo Scans
const QuotaManager = {
  MAX_CREDITS: 3,
  RESET_HOURS: 12,

  getQuota() {
    const saved = localStorage.getItem("streamsnap_demo_quota");
    const lastReset = localStorage.getItem("streamsnap_demo_reset_time");
    const now = Date.now();

    if (!lastReset || now - parseInt(lastReset, 10) > this.RESET_HOURS * 3600 * 1000) {
      localStorage.setItem("streamsnap_demo_quota", this.MAX_CREDITS);
      localStorage.setItem("streamsnap_demo_reset_time", now);
      return this.MAX_CREDITS;
    }
    return saved !== null ? parseInt(saved, 10) : this.MAX_CREDITS;
  },

  useCredit() {
    const current = this.getQuota();
    if (current <= 0) return false;
    const next = current - 1;
    localStorage.setItem("streamsnap_demo_quota", next);
    this.updateUI();
    return true;
  },

  updateUI() {
    const badge = document.getElementById("demo-quota-badge");
    const remaining = this.getQuota();
    if (badge) {
      badge.textContent = `[ DEMO CREDITS: ${remaining} / ${this.MAX_CREDITS} SCANS REMAINING ]`;
      if (remaining <= 0) {
        badge.style.color = "#FF334B";
        badge.style.borderColor = "#FF334B";
        badge.style.background = "rgba(255, 51, 75, 0.15)";
      } else {
        badge.style.color = "var(--primary-gold)";
        badge.style.borderColor = "var(--border-active)";
        badge.style.background = "var(--gold-tint)";
      }
    }
  }
};

function extractYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|live\/|shorts\/)([^#&?]*).*/;
  const match = url.trim().match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

// Multi-Channel Interactive Simulator Database
const CHANNELS_DB = {
  speed: {
    streamTitle: "🔴 LIVE BROADCAST // ISHOWSPEED_MIAMI_SPRING_BREAK_4K",
    isYouTube: true,
    ytId: "5NXo4gdhpCk",
    targets: [
      { key: "jersey", top: "54%", left: "52%", icon: "⚽", label: "PUMA AC MILAN // $89.99", title: "PUMA AC Milan 2023/24 Home Soccer Jersey (MSC & Emirates)", price: "$89.99", verified: true, img: "assets/products/ac_milan_jersey.png", link: "https://www.amazon.com/s?k=PUMA+AC+Milan+2023%2F24+Home+Jersey&tag=streamsnap03-20" },
      { key: "cap", top: "28%", left: "65%", icon: "🧢", label: "ANGELS CAP // $34.99", title: "New Era Los Angeles Angels Black Snapback Cap", price: "$34.99", verified: true, img: "assets/products/angels_cap.png", link: "https://www.amazon.com/s?k=Angels+Snapback+Cap+Black&tag=streamsnap03-20" },
      { key: "tee", top: "48%", left: "38%", icon: "👕", label: "WHITE TEE // $18.50", title: "Classic White Heavyweight Crewneck T-Shirt", price: "$18.50", verified: false, img: "assets/products/white_tee.png", link: "https://www.amazon.com/s?k=White+Crewneck+T-Shirt+Men&tag=streamsnap03-20" }
    ]
  },
  studio: {
    streamTitle: "🔴 BROADCAST // KAI_CENAT_CREATOR_STUDIO_HD.STREAM",
    bgClass: "sim-scene-studio",
    targets: [
      { key: "mic", top: "48%", left: "32%", icon: "🎙️", label: "MIC // $399.00", title: "Shure SM7B Cardioid Dynamic Vocal Microphone", price: "$399.00", verified: true, img: "assets/products/shure_sm7b.png", link: "https://www.amazon.com/dp/B0002E4Z8M?tag=streamsnap03-20" },
      { key: "headphones", top: "26%", left: "46%", icon: "🎧", label: "SONY XM5 // $348.00", title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones", price: "$348.00", verified: true, img: "assets/products/sony_headphones.png", link: "https://www.amazon.com/dp/B09XS7JWHH?tag=streamsnap03-20" },
      { key: "light", top: "18%", left: "76%", icon: "💡", label: "KEY LIGHT // $159.99", title: "Elgato Key Light — 2800 Lumen Studio LED Panel", price: "$159.99", verified: true, img: "assets/products/elgato_light.png", link: "https://www.amazon.com/dp/B07W755322?tag=streamsnap03-20" }
    ]
  },
  fashion: {
    streamTitle: "🔴 BROADCAST // TOKYO_STREETWEAR_HAUL_4K.STREAM",
    bgClass: "sim-scene-fashion",
    targets: [
      { key: "hoodie", top: "44%", left: "40%", icon: "👕", label: "HOODIE // $38.50", title: "Champion Men's Powerblend Fleece Oversized Hoodie", price: "$38.50", verified: false, img: "assets/products/champion_hoodie.png", link: "https://www.amazon.com/s?k=Champion+Hoodie&tag=streamsnap03-20" },
      { key: "lounge", top: "62%", left: "50%", icon: "👗", label: "LOUNGE SET // $29.99", title: "Sampeel 2-Piece Ribbed Knit Matching Lounge Set", price: "$29.99", verified: true, img: "assets/products/champion_hoodie.png", link: "https://www.amazon.com/dp/B0HDSPFHR2?tag=streamsnap03-20" },
      { key: "watch", top: "54%", left: "30%", icon: "⌚", label: "APPLE WATCH // $399", title: "Apple Watch Series 10 (GPS 46mm Jet Black)", price: "$399.00", verified: true, img: "assets/products/apple_watch.png", link: "https://www.amazon.com/s?k=Apple+Watch+Series+10&tag=streamsnap03-20" }
    ]
  },
  fitness: {
    streamTitle: "🔴 BROADCAST // HEAVY_LIFTING_WORKOUT_60FPS.STREAM",
    bgClass: "sim-scene-fitness",
    targets: [
      { key: "plates", top: "58%", left: "28%", icon: "🏋️", label: "BUMPER PLATES // $179", title: "Fringe Sport Black Bumper Plates (Pair of 45lb)", price: "$179.00", verified: false, img: "assets/products/bumper_plates.png", link: "https://www.amazon.com/s?k=Fringe+Sport+Bumper+Plates&tag=streamsnap03-20" },
      { key: "tumbler", top: "42%", left: "62%", icon: "🥤", label: "STANLEY 40OZ // $45.00", title: "Stanley Quencher H2.0 FlowState Tumbler 40oz", price: "$45.00", verified: true, img: "assets/products/stanley_tumbler.png", link: "https://www.amazon.com/dp/B0B94ZDFM9?tag=streamsnap03-20" }
    ]
  },
  gaming: {
    streamTitle: "🔴 BROADCAST // TWITCH_MASTERS_ESPORTS_ARENA.STREAM",
    bgClass: "sim-scene-gaming",
    targets: [
      { key: "airpods", top: "30%", left: "44%", icon: "🎧", label: "AIRPODS MAX // $479", title: "Apple AirPods Max Wireless Over-Ear Headphones", price: "$479.00", verified: true, img: "assets/products/airpods_max.png", link: "https://www.amazon.com/dp/B08PZHYWJS?tag=streamsnap03-20" },
      { key: "deck", top: "64%", left: "54%", icon: "🎮", label: "STREAM DECK // $129", title: "Elgato Stream Deck MK.2 — 15 Custom Macro Keys", price: "$129.99", verified: true, img: "assets/products/elgato_deck.png", link: "https://www.amazon.com/dp/B07W5JK7B6?tag=streamsnap03-20" }
    ]
  }
};

function initSimulator() {
  QuotaManager.updateUI();

  const tabs = document.querySelectorAll(".channel-tab");
  const scene = document.getElementById("sim-scene-container");
  const streamTag = document.getElementById("sim-stream-tag");
  const cropLabel = document.getElementById("sim-crop-label");
  const thumb = document.getElementById("sim-thumb");
  const title = document.getElementById("sim-title");
  const price = document.getElementById("sim-price");
  const matchEl = document.getElementById("sim-match");
  const buyLink = document.getElementById("sim-buy-link");
  const cartBtn = document.getElementById("sim-add-cart-btn");
  const cartStatus = document.getElementById("sim-cart-status");

  const customUrlInput = document.getElementById("custom-stream-input");
  const scanCustomBtn = document.getElementById("btn-scan-custom-stream");
  const quotaModal = document.getElementById("quota-modal");

  function renderChannel(key, customYtId = null) {
    const channel = CHANNELS_DB[key] || CHANNELS_DB.speed;

    tabs.forEach((t) => t.classList.toggle("active", t.dataset.scenario === key));
    if (streamTag) streamTag.textContent = channel.streamTitle;

    if (scene) {
      if (channel.isYouTube || customYtId) {
        const vidId = customYtId || channel.ytId || "5NXo4gdhpCk";
        scene.className = "sim-interactive-scene yt-live-mode";
        scene.innerHTML = `
          <iframe src="https://www.youtube-nocookie.com/embed/${vidId}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1" 
                  class="sim-yt-iframe" 
                  title="YouTube Live Stream" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowfullscreen></iframe>
          <div class="laser-radar-line"></div>
        `;
      } else {
        scene.className = `sim-interactive-scene ${channel.bgClass}`;
        scene.replaceChildren();
      }

      channel.targets.forEach((item, idx) => {
        const spot = document.createElement("div");
        spot.className = "sim-hotspot" + (idx === 0 ? " active" : "");
        spot.style.top = item.top;
        spot.style.left = item.left;
        spot.innerHTML = `
          <span class="hotspot-ping"></span>
          <span class="hotspot-lbl">${item.icon} ${item.label}</span>
        `;
        spot.addEventListener("click", () => selectTarget(item, spot));
        scene.appendChild(spot);
      });
    }

    if (channel.targets[0]) selectTarget(channel.targets[0]);
  }

  function selectTarget(item, spotEl) {
    if (spotEl) {
      document.querySelectorAll(".sim-hotspot").forEach((s) => s.classList.remove("active"));
      spotEl.classList.add("active");
    }

    if (cropLabel) cropLabel.textContent = `OPTICAL LOCK: ${item.title.slice(0, 30)}...`;
    if (thumb) {
      thumb.innerHTML = `<img src="${item.img}" alt="${item.title}" style="width:100%;height:100%;object-fit:contain;" />`;
    }
    if (title) title.textContent = item.title;
    if (price) price.textContent = item.price;
    if (matchEl) {
      matchEl.textContent = item.verified ? "✓ VERIFIED AMAZON LISTING" : "VISUAL SIMILARITY MATCH";
      matchEl.style.color = item.verified ? "#10B981" : "#94A3B8";
    }
    if (buyLink) {
      buyLink.href = item.link;
      buyLink.textContent = item.verified ? "↗ VIEW ON AMAZON" : "↗ SEARCH AMAZON";
    }

    const card = document.getElementById("sim-product-card");
    if (card) {
      card.style.borderColor = "#FF9900";
      card.style.boxShadow = "0 0 24px rgba(255, 153, 0, 0.4)";
      setTimeout(() => { card.style.boxShadow = ""; }, 600);
    }
  }

  // Handle Custom Stream URL Scan
  function triggerCustomScan() {
    const rawUrl = customUrlInput ? customUrlInput.value.trim() : "";
    const ytId = extractYouTubeId(rawUrl);

    if (!ytId) {
      alert("Please enter a valid YouTube URL (e.g. https://www.youtube.com/watch?v=5NXo4gdhpCk)");
      return;
    }

    // Check Quota Protection
    if (QuotaManager.getQuota() <= 0) {
      if (quotaModal) quotaModal.style.display = "flex";
      return;
    }

    // Consume 1 quota credit
    QuotaManager.useCredit();

    if (scanCustomBtn) {
      scanCustomBtn.innerHTML = '<span class="btn-laser-bg"></span><span class="btn-laser-text">⚡ SCANNING OPTICAL STREAM...</span>';
      setTimeout(() => {
        scanCustomBtn.innerHTML = '<span class="btn-laser-bg"></span><span class="btn-laser-text">⚡ SCAN LIVE STREAM</span>';
      }, 1500);
    }

    if (ytId === "5NXo4gdhpCk") {
      renderChannel("speed");
    } else {
      // Dynamic YouTube Custom Stream
      CHANNELS_DB.custom = {
        streamTitle: `🔴 CUSTOM BROADCAST // YT_${ytId}.STREAM`,
        isYouTube: true,
        ytId: ytId,
        targets: [
          { key: "detected1", top: "45%", left: "50%", icon: "🎯", label: "DETECTED ITEM // $49.99", title: `Visual Match from YouTube Stream (${ytId})`, price: "$49.99", verified: false, img: "https://m.media-amazon.com/images/I/61y8E+Y2B1L._AC_SL1500_.jpg", link: `https://www.amazon.com/s?k=Live+Stream+Product&tag=streamsnap03-20` },
          { key: "detected2", top: "25%", left: "60%", icon: "🎧", label: "GEAR // $129.00", title: "Wireless Audio / Creator Tech Match", price: "$129.00", verified: true, img: "https://m.media-amazon.com/images/I/71P4q+HqKQL._AC_SL1500_.jpg", link: `https://www.amazon.com/s?k=Creator+Gear&tag=streamsnap03-20` }
        ]
      };
      renderChannel("custom", ytId);
    }
  }

  if (scanCustomBtn) {
    scanCustomBtn.addEventListener("click", triggerCustomScan);
  }
  if (customUrlInput) {
    customUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") triggerCustomScan();
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const scenario = tab.dataset.scenario;
      if (tab.dataset.url && customUrlInput) {
        customUrlInput.value = tab.dataset.url;
      }
      renderChannel(scenario);
    });
  });

  renderChannel("speed");

  if (cartBtn && cartStatus) {
    cartBtn.addEventListener("click", () => {
      cartStatus.style.display = "block";
      cartBtn.textContent = "✓ IN AMAZON CART";
      cartBtn.style.background = "#10B981";

      setTimeout(() => {
        cartStatus.style.display = "none";
        cartBtn.textContent = "🛒 ADD TO CART";
        cartBtn.style.background = "";
      }, 2400);
    });
  }
}

// Creator Commission Telemetry Calculator
function initCalculator() {
  const inputViewers = document.getElementById("input-viewers");
  const inputHours = document.getElementById("input-hours");
  const inputPrice = document.getElementById("input-price");

  const valViewers = document.getElementById("val-viewers");
  const valHours = document.getElementById("val-hours");
  const valPrice = document.getElementById("val-price");

  const calcEarnings = document.getElementById("calc-earnings");
  const calcAnnual = document.getElementById("calc-annual-val");

  if (!inputViewers || !inputHours || !inputPrice) return;

  function recalculate() {
    const viewers = parseInt(inputViewers.value, 10);
    const hours = parseInt(inputHours.value, 10);
    const avgPrice = parseInt(inputPrice.value, 10);

    valViewers.textContent = viewers.toLocaleString();
    valHours.textContent = `${hours} hrs`;
    valPrice.textContent = `$${avgPrice}.00`;

    // Mathematical formula from official Amazon rate card averages:
    const monthlyTotal = viewers * (hours / 10) * 0.02 * (avgPrice * 0.045) * 1.4;
    const annualTotal = monthlyTotal * 12;

    if (calcEarnings) {
      calcEarnings.textContent = `$${monthlyTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (calcAnnual) {
      calcAnnual.textContent = `$${annualTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / year`;
    }
  }

  inputViewers.addEventListener("input", recalculate);
  inputHours.addEventListener("input", recalculate);
  inputPrice.addEventListener("input", recalculate);

  recalculate();
}

// Modals Management
function initModals() {
  const installModal = document.getElementById("install-modal");
  const installTriggers = document.querySelectorAll(".btn-install-trigger");
  const closeInstallBtn = document.getElementById("close-install-modal");

  installTriggers.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (installModal) installModal.style.display = "flex";
    });
  });

  if (closeInstallBtn && installModal) {
    closeInstallBtn.addEventListener("click", () => {
      installModal.style.display = "none";
    });
  }

  if (installModal) {
    installModal.addEventListener("click", (e) => {
      if (e.target === installModal) installModal.style.display = "none";
    });
  }

  // Connect Creator Tag Modal
  const connectModal = document.getElementById("connect-modal");
  const openConnectBtn = document.getElementById("nav-connect-btn");
  const claimTagBtn = document.getElementById("claim-tag-btn");
  const closeConnectBtn = document.getElementById("close-connect-modal");
  const saveTagBtn = document.getElementById("modal-save-btn");
  const skipTagBtn = document.getElementById("modal-skip-tag-btn");
  const inputTag = document.getElementById("modal-tag-input");

  function openConnect() {
    if (connectModal) connectModal.style.display = "flex";
  }

  function closeConnect() {
    if (connectModal) connectModal.style.display = "none";
  }

  if (openConnectBtn) openConnectBtn.addEventListener("click", openConnect);
  if (claimTagBtn) claimTagBtn.addEventListener("click", openConnect);
  if (closeConnectBtn) closeConnectBtn.addEventListener("click", closeConnect);

  if (skipTagBtn) {
    skipTagBtn.addEventListener("click", () => {
      closeConnect();
      if (installModal) installModal.style.display = "flex";
    });
  }

  if (connectModal) {
    connectModal.addEventListener("click", (e) => {
      if (e.target === connectModal) closeConnect();
    });
  }

  if (saveTagBtn && inputTag) {
    saveTagBtn.addEventListener("click", () => {
      const tag = inputTag.value.trim() || "streamsnap03-20";
      localStorage.setItem("streamsnap_tag", tag);
      saveTagBtn.innerHTML = '<span class="btn-laser-bg"></span><span class="btn-laser-text">✓ TAG SAVED &amp; ACTIVATED!</span>';
      setTimeout(() => {
        closeConnect();
        saveTagBtn.innerHTML = '<span class="btn-laser-bg"></span><span class="btn-laser-text">SAVE TAG &amp; ACTIVATE ⚡</span>';
      }, 1200);
    });
  }

  // Rate Limit Quota Modal
  const quotaModal = document.getElementById("quota-modal");
  const closeQuotaBtn = document.getElementById("close-quota-modal");
  const dismissQuotaBtn = document.getElementById("btn-quota-dismiss");

  function closeQuota() {
    if (quotaModal) quotaModal.style.display = "none";
  }

  if (closeQuotaBtn) closeQuotaBtn.addEventListener("click", closeQuota);
  if (dismissQuotaBtn) dismissQuotaBtn.addEventListener("click", closeQuota);
  if (quotaModal) {
    quotaModal.addEventListener("click", (e) => {
      if (e.target === quotaModal) closeQuota();
    });
  }
}

// FAQ Accordion
function initFAQ() {
  const blocks = document.querySelectorAll(".faq-block");
  blocks.forEach((block) => {
    const header = block.querySelector(".faq-header");
    if (!header) return;

    header.addEventListener("click", () => {
      const wasActive = block.classList.contains("active");
      blocks.forEach((b) => b.classList.remove("active"));
      if (!wasActive) block.classList.add("active");
    });
  });
}

// ===================== NAV AUTH STATE =====================
function initNavAuth() {
  const workerBase = getWorkerBase();
  const signinBtn = document.getElementById("nav-signin-btn");
  const userPill  = document.getElementById("nav-user-pill");
  const nameEl    = document.getElementById("nav-user-name");
  const avatarEl  = document.getElementById("nav-avatar");
  const signoutLink = document.getElementById("nav-signout-link");

  if (!signinBtn || !userPill) return;

  const returnUrl = encodeURIComponent(window.location.origin + '/account.html');
  signinBtn.href = `${workerBase}/auth/start?client=web&return_to=${returnUrl}`;

  // Wire sign-out to call POST /auth/logout then reload
  signoutLink?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await fetch(`${workerBase}/auth/logout`, { method: "POST", credentials: "include" });
    } catch (_) {}
    signinBtn.style.display = "";
    userPill.style.display = "none";
  });

  // Check auth state
  fetch(`${workerBase}/auth/me`, { credentials: "include" })
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (data?.ok && data.signedIn) {
        const user = data.user || {};
        if (nameEl) nameEl.textContent = (user.name || user.email || "Account").split(" ")[0].toUpperCase();
        if (avatarEl && user.avatarUrl) { avatarEl.src = user.avatarUrl; avatarEl.style.display = "block"; }
        signinBtn.style.display = "none";
        userPill.style.display = "flex";
      }
    })
    .catch(() => { /* offline — leave sign-in button visible */ });
}

function initVersion() {
  const workerBase = getWorkerBase();
  fetch(`${workerBase}/version`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.latestVersion) {
        document.querySelectorAll('.dynamic-version').forEach(el => {
          el.textContent = data.latestVersion;
        });
        // Update download links if any
        document.querySelectorAll('a[download^="streamsnap-extension"]').forEach(a => {
          a.setAttribute("download", `streamsnap-extension-v${data.latestVersion}.zip`);
        });
      }
    })
    .catch(() => {});
}

document.addEventListener("DOMContentLoaded", () => {
  initNavAuth();
  initVersion();
});
