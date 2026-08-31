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
    mic: {
      title: "Shure SM7B Cardioid Dynamic Vocal Microphone",
      price: "$399.00",
      asin: "B0002E4Z8M",
      box: { top: "36%", left: "28%", width: "150px", height: "170px" },
      label: "SHURE_SM7B",
      conf: "99.4%",
      img: "https://m.media-amazon.com/images/I/71P4q+HqKQL._AC_SL1500_.jpg",
      link: "https://www.amazon.com/dp/B0002E4Z8M?tag=streamsnap03-20"
    },
    light: {
      title: "Elgato Key Light — 2800 Lumen Professional Studio LED",
      price: "$159.99",
      asin: "B07W755322",
      box: { top: "14%", left: "70%", width: "160px", height: "130px" },
      label: "ELGATO_KEYLIGHT",
      conf: "98.7%",
      img: "https://m.media-amazon.com/images/I/61LpX3fXQAL._AC_SL1500_.jpg",
      link: "https://www.amazon.com/dp/B07W755322?tag=streamsnap03-20"
    },
    hoodie: {
      title: "Champion Men's Powerblend Fleece Oversized Streetwear Hoodie",
      price: "$38.50",
      asin: "B01H492K6S",
      box: { top: "54%", left: "44%", width: "170px", height: "180px" },
      label: "CHAMPION_HOODIE",
      conf: "97.1%",
      img: "https://m.media-amazon.com/images/I/71j1n-1Pq-L._AC_SL1500_.jpg",
      link: "https://www.amazon.com/s?k=Champion+Hoodie&tag=streamsnap03-20"
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

// Multi-Channel Interactive Simulator Database
const CHANNELS_DB = {
  studio: {
    streamTitle: "🔴 BROADCAST // KAI_CENAT_CREATOR_STUDIO_HD.STREAM",
    bgClass: "sim-scene-studio",
    targets: [
      { key: "mic", top: "48%", left: "32%", icon: "🎙️", label: "MIC // $399.00", title: "Shure SM7B Cardioid Dynamic Vocal Microphone", price: "$399.00", verified: true, img: "https://m.media-amazon.com/images/I/71P4q+HqKQL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B0002E4Z8M?tag=streamsnap03-20" },
      { key: "headphones", top: "26%", left: "46%", icon: "🎧", label: "SONY XM5 // $348.00", title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones", price: "$348.00", verified: true, img: "https://m.media-amazon.com/images/I/61vJtKbAssL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B09XS7JWHH?tag=streamsnap03-20" },
      { key: "light", top: "18%", left: "76%", icon: "💡", label: "KEY LIGHT // $159.99", title: "Elgato Key Light — 2800 Lumen Studio LED Panel", price: "$159.99", verified: true, img: "https://m.media-amazon.com/images/I/61LpX3fXQAL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B07W755322?tag=streamsnap03-20" }
    ]
  },
  fashion: {
    streamTitle: "🔴 BROADCAST // TOKYO_STREETWEAR_HAUL_4K.STREAM",
    bgClass: "sim-scene-fashion",
    targets: [
      { key: "hoodie", top: "44%", left: "40%", icon: "👕", label: "HOODIE // $38.50", title: "Champion Men's Powerblend Fleece Oversized Hoodie", price: "$38.50", verified: false, img: "https://m.media-amazon.com/images/I/71j1n-1Pq-L._AC_SL1500_.jpg", link: "https://www.amazon.com/s?k=Champion+Hoodie&tag=streamsnap03-20" },
      { key: "lounge", top: "62%", left: "50%", icon: "👗", label: "LOUNGE SET // $29.99", title: "Sampeel 2-Piece Ribbed Knit Matching Lounge Set", price: "$29.99", verified: true, img: "https://m.media-amazon.com/images/I/71j1n-1Pq-L._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B0HDSPFHR2?tag=streamsnap03-20" },
      { key: "watch", top: "54%", left: "30%", icon: "⌚", label: "APPLE WATCH // $399", title: "Apple Watch Series 10 (GPS 46mm Jet Black)", price: "$399.00", verified: true, img: "https://m.media-amazon.com/images/I/81+23E2GgQL._AC_SL1500_.jpg", link: "https://www.amazon.com/s?k=Apple+Watch+Series+10&tag=streamsnap03-20" }
    ]
  },
  fitness: {
    streamTitle: "🔴 BROADCAST // HEAVY_LIFTING_WORKOUT_60FPS.STREAM",
    bgClass: "sim-scene-fitness",
    targets: [
      { key: "plates", top: "58%", left: "28%", icon: "🏋️", label: "BUMPER PLATES // $179", title: "Fringe Sport Black Bumper Plates (Pair of 45lb)", price: "$179.00", verified: false, img: "https://m.media-amazon.com/images/I/61k2YfR1L-L._AC_SL1500_.jpg", link: "https://www.amazon.com/s?k=Fringe+Sport+Bumper+Plates&tag=streamsnap03-20" },
      { key: "tumbler", top: "42%", left: "62%", icon: "🥤", label: "STANLEY 40OZ // $45.00", title: "Stanley Quencher H2.0 FlowState Tumbler 40oz", price: "$45.00", verified: true, img: "https://m.media-amazon.com/images/I/61vK+GvKxLL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B0B94ZDFM9?tag=streamsnap03-20" }
    ]
  },
  gaming: {
    streamTitle: "🔴 BROADCAST // TWITCH_MASTERS_ESPORTS_ARENA.STREAM",
    bgClass: "sim-scene-gaming",
    targets: [
      { key: "airpods", top: "30%", left: "44%", icon: "🎧", label: "AIRPODS MAX // $479", title: "Apple AirPods Max Wireless Over-Ear Headphones", price: "$479.00", verified: true, img: "https://m.media-amazon.com/images/I/81jqUPkIVRL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B08PZHYWJS?tag=streamsnap03-20" },
      { key: "deck", top: "64%", left: "54%", icon: "🎮", label: "STREAM DECK // $129", title: "Elgato Stream Deck MK.2 — 15 Custom Macro Keys", price: "$129.99", verified: true, img: "https://m.media-amazon.com/images/I/61B5UjF7pKL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B07W5JK7B6?tag=streamsnap03-20" }
    ]
  }
};

function initSimulator() {
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

  function renderChannel(key) {
    const channel = CHANNELS_DB[key] || CHANNELS_DB.studio;

    tabs.forEach((t) => t.classList.toggle("active", t.dataset.scenario === key));
    if (streamTag) streamTag.textContent = channel.streamTitle;

    if (scene) {
      scene.className = `sim-interactive-scene ${channel.bgClass}`;
      scene.replaceChildren();

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

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => renderChannel(tab.dataset.scenario));
  });

  renderChannel("studio");

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
