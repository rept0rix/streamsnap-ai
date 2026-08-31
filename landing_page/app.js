/**
 * StreamSnap AI — Landing Page Interactive Engine
 */

// Official Chrome Web Store URL
const CHROME_STORE_URL = "https://chromewebstore.google.com/detail/streamsnap-ai-%E2%80%94-live-stre/efbfecbochblmakpdllbnpdgkmmfmmel";

document.addEventListener("DOMContentLoaded", () => {
  initHeroInteractive();
  initSimulator();
  initCalculator();
  initModals();
  initFAQ();
});

// Multi-Scenario Database for Interactive Arena
const SIM_SCENARIOS = {
  studio: {
    title: "🔴 LIVE: Creator Studio & Podcast Setup",
    bgClass: "sim-scene-studio",
    hotspots: [
      { key: "mic", top: "48%", left: "32%", icon: "🎙️", label: "Microphone", title: "Shure SM7B Vocal Dynamic Microphone", price: "$399.00", verified: true, image: "https://m.media-amazon.com/images/I/71P4q+HqKQL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B0002E4Z8M?tag=streamsnap03-20" },
      { key: "headphones", top: "26%", left: "46%", icon: "🎧", label: "Headphones", title: "Sony WH-1000XM5 Noise Canceling Headphones", price: "$348.00", verified: true, image: "https://m.media-amazon.com/images/I/61vJtKbAssL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B09XS7JWHH?tag=streamsnap03-20" },
      { key: "lighting", top: "18%", left: "76%", icon: "💡", label: "Studio Light", title: "Elgato Key Light — 2800 Lumen Studio LED Panel", price: "$159.99", verified: true, image: "https://m.media-amazon.com/images/I/61LpX3fXQAL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B07W755322?tag=streamsnap03-20" },
      { key: "deck", top: "68%", left: "58%", icon: "🎮", label: "Stream Deck", title: "Elgato Stream Deck MK.2 — 15 Macro Keys", price: "$129.99", verified: true, image: "https://m.media-amazon.com/images/I/61B5UjF7pKL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B07W5JK7B6?tag=streamsnap03-20" }
    ]
  },
  fashion: {
    title: "🔴 LIVE: Try-On Haul & Streetwear Stream",
    bgClass: "sim-scene-fashion",
    hotspots: [
      { key: "hoodie", top: "45%", left: "40%", icon: "👕", label: "Hoodie", title: "Champion Men's Powerblend Fleece Oversized Hoodie", price: "$38.50", verified: false, image: "https://m.media-amazon.com/images/I/71j1n-1Pq-L._AC_SL1500_.jpg", link: "https://www.amazon.com/s?k=Champion+Hoodie&tag=streamsnap03-20" },
      { key: "lounge", top: "62%", left: "48%", icon: "👗", label: "Lounge Set", title: "Sampeel 2-Piece Ribbed Knit Matching Lounge Set", price: "$29.99", verified: true, image: "https://m.media-amazon.com/images/I/71j1n-1Pq-L._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B0HDSPFHR2?tag=streamsnap03-20" },
      { key: "watch", top: "54%", left: "30%", icon: "⌚", label: "Smartwatch", title: "Apple Watch Series 10 (GPS 46mm Jet Black)", price: "$399.00", verified: true, image: "https://m.media-amazon.com/images/I/81+23E2GgQL._AC_SL1500_.jpg", link: "https://www.amazon.com/s?k=Apple+Watch+Series+10&tag=streamsnap03-20" }
    ]
  },
  fitness: {
    title: "🔴 LIVE: Gym Workout & Training Session",
    bgClass: "sim-scene-fitness",
    hotspots: [
      { key: "weights", top: "58%", left: "28%", icon: "🏋️", label: "Bumper Plates", title: "Fringe Sport Black Bumper Plates (Pair of 45lb)", price: "$179.00", verified: false, image: "https://m.media-amazon.com/images/I/61k2YfR1L-L._AC_SL1500_.jpg", link: "https://www.amazon.com/s?k=Fringe+Sport+Bumper+Plates&tag=streamsnap03-20" },
      { key: "tumbler", top: "42%", left: "62%", icon: "🥤", label: "Tumbler 40oz", title: "Stanley Quencher H2.0 FlowState Tumbler 40oz", price: "$45.00", verified: true, image: "https://m.media-amazon.com/images/I/61vK+GvKxLL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B0B94ZDFM9?tag=streamsnap03-20" }
    ]
  },
  gaming: {
    title: "🔴 LIVE: Twitch Esports & Battlestation",
    bgClass: "sim-scene-gaming",
    hotspots: [
      { key: "airpods", top: "30%", left: "44%", icon: "🎧", label: "AirPods Max", title: "Apple AirPods Max Wireless Over-Ear Headphones", price: "$479.00", verified: true, image: "https://m.media-amazon.com/images/I/81jqUPkIVRL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B08PZHYWJS?tag=streamsnap03-20" },
      { key: "streamdeck", top: "64%", left: "52%", icon: "🎮", label: "Controller", title: "Elgato Stream Deck MK.2 — 15 Macro Keys", price: "$129.99", verified: true, image: "https://m.media-amazon.com/images/I/61B5UjF7pKL._AC_SL1500_.jpg", link: "https://www.amazon.com/dp/B07W5JK7B6?tag=streamsnap03-20" }
    ]
  }
};

let currentScenarioKey = "studio";

function initHeroInteractive() {
  const heroHotspots = document.querySelectorAll(".hero-stream-hotspot");
  const heroCard = document.getElementById("hero-detection-card");
  const heroThumb = document.getElementById("hero-card-img");
  const heroTitle = document.getElementById("hero-card-title");
  const heroPrice = document.getElementById("hero-card-price");
  const heroBuy = document.getElementById("hero-card-buy");

  if (!heroHotspots.length) return;

  const heroItems = {
    mic: {
      title: "Shure SM7B Vocal Dynamic Microphone",
      price: "$399.00",
      image: "https://m.media-amazon.com/images/I/71P4q+HqKQL._AC_SL1500_.jpg",
      link: "https://www.amazon.com/dp/B0002E4Z8M?tag=streamsnap03-20"
    },
    hoodie: {
      title: "Champion Men's Powerblend Fleece Streetwear Hoodie",
      price: "$38.50",
      image: "https://m.media-amazon.com/images/I/71j1n-1Pq-L._AC_SL1500_.jpg",
      link: "https://www.amazon.com/s?k=Champion+Hoodie&tag=streamsnap03-20"
    },
    light: {
      title: "Elgato Key Light — 2800 Lumen Studio LED Panel",
      price: "$159.99",
      image: "https://m.media-amazon.com/images/I/61LpX3fXQAL._AC_SL1500_.jpg",
      link: "https://www.amazon.com/dp/B07W755322?tag=streamsnap03-20"
    }
  };

  heroHotspots.forEach((spot) => {
    spot.addEventListener("click", () => {
      heroHotspots.forEach(s => s.classList.remove("active"));
      spot.classList.add("active");

      const key = spot.dataset.item;
      const data = heroItems[key];
      if (!data || !heroCard) return;

      if (heroThumb) heroThumb.src = data.image;
      if (heroTitle) heroTitle.textContent = data.title;
      if (heroPrice) heroPrice.textContent = data.price;
      if (heroBuy) heroBuy.href = data.link;

      heroCard.classList.remove("animate-pop");
      void heroCard.offsetWidth; // trigger reflow
      heroCard.classList.add("animate-pop");
    });
  });
}

function initSimulator() {
  const tabs = document.querySelectorAll(".sim-scenario-tab");
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

  function renderScenario(key) {
    currentScenarioKey = key;
    const scenario = SIM_SCENARIOS[key] || SIM_SCENARIOS.studio;

    tabs.forEach(t => t.classList.toggle("active", t.dataset.scenario === key));
    if (streamTag) streamTag.textContent = scenario.title;
    if (scene) {
      scene.className = `sim-video-scene ${scenario.bgClass}`;
      scene.replaceChildren();

      scenario.hotspots.forEach((item, idx) => {
        const spot = document.createElement("div");
        spot.className = "sim-hotspot" + (idx === 0 ? " active" : "");
        spot.style.top = item.top;
        spot.style.left = item.left;
        spot.dataset.key = item.key;
        spot.innerHTML = `
          <span class="hotspot-ping"></span>
          <span class="hotspot-lbl">${item.icon} ${item.label}</span>
        `;
        spot.addEventListener("click", () => selectItem(item, spot));
        scene.appendChild(spot);
      });
    }

    if (scenario.hotspots[0]) selectItem(scenario.hotspots[0]);
  }

  function selectItem(item, spotEl) {
    if (spotEl) {
      document.querySelectorAll(".sim-hotspot").forEach(s => s.classList.remove("active"));
      spotEl.classList.add("active");
    }

    if (cropLabel) cropLabel.textContent = `🎯 Detected: ${item.title.slice(0, 32)}...`;
    if (thumb) {
      thumb.innerHTML = `<img src="${item.image}" alt="${item.title}" style="width:100%;height:100%;object-fit:contain;border-radius:6px;" />`;
    }
    if (title) title.textContent = item.title;
    if (price) price.textContent = item.price;
    if (matchEl) {
      matchEl.textContent = item.verified ? "✓ Verified Amazon listing" : "Visual match";
      matchEl.className = item.verified ? "sim-match verified" : "sim-match unverified";
    }
    if (buyLink) {
      buyLink.href = item.link;
      buyLink.textContent = item.verified ? "↗ View on Amazon" : "↗ Search Amazon";
    }

    const card = document.getElementById("sim-product-card");
    if (card) {
      card.style.borderColor = "#FF9900";
      card.style.boxShadow = "0 0 24px rgba(255, 153, 0, 0.4)";
      setTimeout(() => {
        card.style.boxShadow = "";
      }, 700);
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => renderScenario(tab.dataset.scenario));
  });

  renderScenario("studio");

  if (cartBtn && cartStatus) {
    cartBtn.addEventListener("click", () => {
      cartStatus.style.display = "block";
      cartBtn.textContent = "✓ In Amazon Cart";
      cartBtn.style.background = "#10B981";

      setTimeout(() => {
        cartStatus.style.display = "none";
        cartBtn.textContent = "🛒 Add to Amazon Cart";
        cartBtn.style.background = "";
      }, 2500);
    });
  }
}

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

    // Formula: (Viewers * Hours * 0.015 CTR * 0.08 Cart Conversion * AvgPrice * 0.06 Commission)
    const monthlyTotal = viewers * (hours / 10) * 0.02 * (avgPrice * 0.06) * 1.3;
    const annualTotal = monthlyTotal * 12;

    if (calcEarnings) {
      calcEarnings.textContent = `$${monthlyTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (calcAnnual) {
      calcAnnual.textContent = `$${annualTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  inputViewers.addEventListener("input", recalculate);
  inputHours.addEventListener("input", recalculate);
  inputPrice.addEventListener("input", recalculate);

  recalculate();
}

function initModals() {
  // Install Modal
  const installModal = document.getElementById("install-modal");
  const installTriggers = document.querySelectorAll(".btn-install-trigger");
  const closeInstallBtn = document.getElementById("close-install-modal");
  const storeInstallBtn = document.getElementById("store-install-btn");

  if (storeInstallBtn) {
    storeInstallBtn.href = CHROME_STORE_URL;
  }

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
      if (e.target === installModal) {
        installModal.style.display = "none";
      }
    });
  }

  // Connect Amazon Modal
  const connectModal = document.getElementById("connect-modal");
  const openConnectBtn = document.getElementById("nav-connect-btn");
  const claimTagBtn = document.getElementById("claim-tag-btn");
  const closeConnectBtn = document.getElementById("close-connect-modal");
  const saveTagBtn = document.getElementById("modal-save-btn");
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

  if (connectModal) {
    connectModal.addEventListener("click", (e) => {
      if (e.target === connectModal) closeConnect();
    });
  }

  const skipTagBtn = document.getElementById("modal-skip-tag-btn");
  if (skipTagBtn) {
    skipTagBtn.addEventListener("click", () => {
      closeConnect();
      if (installModal) installModal.style.display = "flex";
    });
  }

  if (saveTagBtn && inputTag) {
    saveTagBtn.addEventListener("click", () => {
      const tag = inputTag.value.trim() || "streamsnap03-20";
      localStorage.setItem("streamsnap_tag", tag);
      saveTagBtn.textContent = "✓ Connected & Activated!";
      saveTagBtn.style.background = "#10B981";
      setTimeout(() => {
        closeConnect();
        saveTagBtn.textContent = "Save & Activate ⚡";
        saveTagBtn.style.background = "";
      }, 1200);
    });
  }
}

function initFAQ() {
  const faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach((item) => {
    const question = item.querySelector(".faq-question");
    if (!question) return;

    question.addEventListener("click", () => {
      const isActive = item.classList.contains("active");
      faqItems.forEach((other) => other.classList.remove("active"));
      if (!isActive) {
        item.classList.add("active");
      }
    });
  });
}
