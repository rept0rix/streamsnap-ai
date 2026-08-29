/**
 * StreamSnap AI — Landing Page Interactive Engine
 */

// Official Chrome Web Store URL (configured once live in developer console)
const CHROME_STORE_URL = "https://chromewebstore.google.com/detail/streamsnap-ai";

document.addEventListener("DOMContentLoaded", () => {
  initSimulator();
  initCalculator();
  initModals();
  initFAQ();
});

// Products database for interactive simulator
const SIM_PRODUCTS = {
  mic: {
    title: "Shure SM7B Cardioid Dynamic Vocal Microphone",
    price: "$399.00",
    match: "100% Exact Match",
    icon: "🎙️",
    asin: "B0002E4Z8M",
    link: "https://www.amazon.com/dp/B0002E4Z8M?tag=streamsnap03-20"
  },
  headphones: {
    title: "Sony WH-1000XM5 Noise Canceling Headphones",
    price: "$348.00",
    match: "98% Visual Match",
    icon: "🎧",
    asin: "B09XS7JWHH",
    link: "https://www.amazon.com/dp/B09XS7JWHH?tag=streamsnap03-20"
  },
  hoodie: {
    title: "Champion Men's Powerblend Fleece Oversized Streetwear Hoodie",
    price: "$38.50",
    match: "94% Visual Match",
    icon: "👕",
    asin: "B09KND9W8Z",
    link: "https://www.amazon.com/s?k=Champion+Hoodie&tag=streamsnap03-20"
  },
  weights: {
    title: "Fringe Sport Black Bumper Plates (Pair of 45lb)",
    price: "$179.00",
    match: "96% Exact Match",
    icon: "🏋️‍♂️",
    asin: "B07H8K9110",
    link: "https://www.amazon.com/s?k=Fringe+Sport+Bumper+Plates&tag=streamsnap03-20"
  },
  lighting: {
    title: "Elgato Key Light — 2800 Lumen Studio LED Panel",
    price: "$199.99",
    match: "100% Exact Match",
    icon: "💡",
    asin: "B07W755322",
    link: "https://www.amazon.com/dp/B07W755322?tag=streamsnap03-20"
  }
};

function initSimulator() {
  const hotspots = document.querySelectorAll(".sim-hotspot");
  const cropLabel = document.getElementById("sim-crop-label");
  const thumb = document.getElementById("sim-thumb");
  const title = document.getElementById("sim-title");
  const price = document.getElementById("sim-price");
  const buyLink = document.getElementById("sim-buy-link");
  const cartBtn = document.getElementById("sim-add-cart-btn");
  const cartStatus = document.getElementById("sim-cart-status");

  if (!hotspots.length) return;

  hotspots.forEach((spot) => {
    spot.addEventListener("click", () => {
      const key = spot.dataset.item;
      const item = SIM_PRODUCTS[key];
      if (!item) return;

      if (cropLabel) cropLabel.textContent = `🎯 Cropped: ${item.title.slice(0, 30)}...`;
      if (thumb) thumb.textContent = item.icon;
      if (title) title.textContent = item.title;
      if (price) price.textContent = item.price;
      if (buyLink) buyLink.href = item.link;

      // Animate card highlight
      const card = document.getElementById("sim-product-card");
      if (card) {
        card.style.borderColor = "#FF9900";
        card.style.boxShadow = "0 0 24px rgba(255, 153, 0, 0.45)";
        setTimeout(() => {
          card.style.boxShadow = "";
        }, 800);
      }
    });
  });

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
