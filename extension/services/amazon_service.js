/**
 * StreamSnap AI — Amazon Commerce Service
 *
 * Design rule: this module NEVER invents an ASIN.
 * A product is either resolved against the verified catalog below (and gets a
 * direct /dp/ link), or it is treated as unverified and gets a search link
 * built from its detected title. A fabricated ASIN produces a dead Amazon page,
 * which is both a bad user experience and a Chrome Web Store policy problem.
 */

const DEFAULT_AFFILIATE_TAG = "streamsnap03-20";

/** Real, manually verified ASINs. Used to upgrade a detection to a direct link. */
export const VERIFIED_PRODUCTS = {
  B0002E4Z8M: {
    asin: "B0002E4Z8M",
    title: "Shure SM7B Cardioid Dynamic Vocal Microphone",
    brand: "Shure",
    category: "Audio & Mic",
    price: 399.0,
    originalPrice: 499.0,
    discountPercent: 20,
    dealBadge: "Pro Choice 🔥",
    image: "https://m.media-amazon.com/images/I/71P4q+HqKQL._AC_SL1500_.jpg"
  },
  B09XS7JWHH: {
    asin: "B09XS7JWHH",
    title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
    brand: "Sony",
    category: "Headphones",
    price: 348.0,
    originalPrice: 399.99,
    discountPercent: 13,
    dealBadge: "Save $52 ⚡",
    image: "https://m.media-amazon.com/images/I/61vJtKbAssL._AC_SL1500_.jpg"
  },
  B07W755322: {
    asin: "B07W755322",
    title: "Elgato Key Light — 2800 Lumen Studio LED Panel",
    brand: "Elgato",
    category: "Studio Lighting",
    price: 159.99,
    originalPrice: 199.99,
    discountPercent: 20,
    dealBadge: "20% OFF 🔥",
    image: "https://m.media-amazon.com/images/I/61LpX3fXQAL._AC_SL1500_.jpg"
  },
  B07W5JK7B6: {
    asin: "B07W5JK7B6",
    title: "Elgato Stream Deck MK.2 — 15 Macro Keys Studio Controller",
    brand: "Elgato",
    category: "Gaming & Gear",
    price: 129.99,
    originalPrice: 149.99,
    discountPercent: 13,
    dealBadge: "Stream Deal ⚡",
    image: "https://m.media-amazon.com/images/I/61B5UjF7pKL._AC_SL1500_.jpg"
  },
  B0B94ZDFM9: {
    asin: "B0B94ZDFM9",
    title: "Stanley Quencher H2.0 FlowState Stainless Steel Tumbler 40oz",
    brand: "Stanley",
    category: "Drinkware",
    price: 45.0,
    image: "https://m.media-amazon.com/images/I/61vK+GvKxLL._AC_SL1500_.jpg"
  },
  B08PZHYWJS: {
    asin: "B08PZHYWJS",
    title: "Apple AirPods Max Wireless Over-Ear Headphones",
    brand: "Apple",
    category: "Headphones",
    price: 479.0,
    originalPrice: 549.0,
    discountPercent: 13,
    dealBadge: "Limited Deal 🔥",
    image: "https://m.media-amazon.com/images/I/81jqUPkIVRL._AC_SL1500_.jpg"
  },
  B0DHJ3SRDL: {
    asin: "B0DHJ3SRDL",
    title: "Apple iPhone 16 Pro Max (Desert Titanium)",
    brand: "Apple",
    category: "Phones & Tech",
    price: 1199.0,
    image: "https://m.media-amazon.com/images/I/81+23E2GgQL._AC_SL1500_.jpg"
  },
  B0HDSPFHR2: {
    asin: "B0HDSPFHR2",
    title: "Sampeel Airport Outfits 2-Piece Lounge Matching Set",
    brand: "Sampeel",
    category: "Fashion & Apparel",
    price: 29.99,
    originalPrice: 39.99,
    discountPercent: 25,
    dealBadge: "25% OFF 🔥",
    image: "https://m.media-amazon.com/images/I/71j1n-1Pq-L._AC_SL1500_.jpg"
  },
  B0HGDV476B: {
    asin: "B0HGDV476B",
    title: "Ninja HydraSense Intelligent Water Filtration System",
    brand: "Ninja",
    category: "Home & Kitchen",
    price: 169.99,
    originalPrice: 199.99,
    discountPercent: 15,
    dealBadge: "Save $30 ⚡",
    image: "https://m.media-amazon.com/images/I/71UqI4pWv1L._AC_SL1500_.jpg"
  },
  B08285CV9C: {
    asin: "B08285CV9C",
    title: "Replacement Analog 3D Thumbstick Joystick for Controller",
    brand: "Generic",
    category: "Gaming & Gear",
    price: 7.99,
    originalPrice: 9.99,
    discountPercent: 20,
    dealBadge: "20% OFF",
    image: "https://m.media-amazon.com/images/I/61k2YfR1L-L._AC_SL1500_.jpg"
  },
  B0FRY24FNG: {
    asin: "B0FRY24FNG",
    title: "The Complete Matrix Trilogy (3-Pack 4K Ultra HD)",
    brand: "Warner Bros",
    category: "Movies & Media",
    price: 34.99,
    originalPrice: 49.99,
    discountPercent: 30,
    dealBadge: "30% OFF 🔥",
    image: "https://m.media-amazon.com/images/I/81h9iZf5vVL._AC_SL1500_.jpg"
  }
};

const ASIN_PATTERN = /^B0[A-Z0-9]{8}$/;

/** True only for a syntactically valid ASIN. Does not imply the ASIN exists. */
export function isValidAsin(asin) {
  return typeof asin === "string" && ASIN_PATTERN.test(asin);
}

/** True when we have independently verified this ASIN maps to a real listing. */
export function isVerifiedAsin(asin) {
  return isValidAsin(asin) && Object.prototype.hasOwnProperty.call(VERIFIED_PRODUCTS, asin);
}

export function getProductByAsin(asin) {
  return VERIFIED_PRODUCTS[asin] || null;
}

/**
 * Reconcile a model detection against the verified catalog.
 *
 * Returns the item with `verified` set. When the model supplied an ASIN we
 * cannot verify, the ASIN is dropped rather than surfaced as a dead link.
 */
export function resolveDetection(item) {
  if (!item || typeof item !== "object") return null;

  const title = String(item.title || item.detectionLabel || "").trim();
  if (!title) return null;

  const claimedAsin = typeof item.asin === "string" ? item.asin.trim().toUpperCase() : "";

  if (isVerifiedAsin(claimedAsin)) {
    const known = VERIFIED_PRODUCTS[claimedAsin];
    return {
      ...item,
      asin: known.asin,
      title: known.title,
      brand: known.brand,
      price: known.price,
      originalPrice: known.originalPrice || null,
      discountPercent: known.discountPercent || null,
      dealBadge: known.dealBadge || null,
      image: known.image,
      category: known.category,
      verified: true
    };
  }

  // Try to match by title against the verified catalog before giving up.
  const byTitle = matchVerifiedByTitle(title);
  if (byTitle) {
    return {
      ...item,
      asin: byTitle.asin,
      title: byTitle.title,
      brand: byTitle.brand,
      price: byTitle.price,
      originalPrice: byTitle.originalPrice || null,
      discountPercent: byTitle.discountPercent || null,
      dealBadge: byTitle.dealBadge || null,
      image: byTitle.image,
      category: byTitle.category,
      verified: true
    };
  }

  // Unverified: keep the visual detection, handle optional price/discount fields.
  const price = typeof item.price === "number" && item.price > 0 ? item.price : null;
  const originalPrice = typeof item.originalPrice === "number" && item.originalPrice > (price || 0)
    ? item.originalPrice
    : null;
  const discountPercent = originalPrice && price
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : (typeof item.discountPercent === "number" ? item.discountPercent : null);

  return {
    ...item,
    asin: null,
    title,
    price,
    originalPrice,
    discountPercent,
    dealBadge: item.dealBadge || (discountPercent ? `${discountPercent}% OFF 🔥` : null),
    image: null,
    category: categorizeProduct(title),
    verified: false
  };
}

function matchVerifiedByTitle(title) {
  const needle = title.toLowerCase();
  for (const product of Object.values(VERIFIED_PRODUCTS)) {
    const brand = (product.brand || "").toLowerCase();
    // Require the brand plus a distinctive model token to avoid false positives.
    if (!brand || !needle.includes(brand)) continue;
    const tokens = product.title
      .toLowerCase()
      .split(/[\s—,()]+/)
      .filter((t) => t.length >= 4 && t !== brand);
    if (tokens.some((t) => needle.includes(t))) return product;
  }
  return null;
}

/** Auto-categorize a product by title keywords. */
export function categorizeProduct(title = "") {
  const t = String(title).toLowerCase();
  const rules = [
    ["Gym & Fitness", ["plate", "bumper", "weight", "dumbbell", "barbell", "rack", "gym", "fitness", "bench"]],
    ["Cosplay & Costume", ["costume", "bodysuit", "superhero", "cape", "villain", "mask", "cosplay"]],
    ["Streetwear & Apparel", ["hoodie", "jacket", "shirt", "pants", "clothing", "streetwear", "hat", "cap", "sweatshirt"]],
    ["Audio & Mic", ["mic", "microphone", "shure", "audio", "rode", "podcast"]],
    ["Headphones", ["headphone", "airpods", "earphone", "bose", "wh-1000"]],
    ["Studio Lighting", ["light", "strobe", "govee", "elgato key", "panel", "neon"]],
    ["Drinkware", ["cup", "tumbler", "stanley", "mug", "bottle", "drink"]],
    ["Gaming & Gear", ["stream deck", "controller", "keyboard", "mouse", "monitor", "console"]]
  ];
  for (const [category, keywords] of rules) {
    if (keywords.some((k) => t.includes(k))) return category;
  }
  return "General Gear";
}

/**
 * Official Amazon Associates Standard Fixed Commission Income Rates.
 */
export const OFFICIAL_COMMISSION_RATES = {
  amazon_games: 0.20,
  luxury_beauty: 0.10,
  digital_music_video: 0.05,
  books_kitchen_auto: 0.045,
  fashion_apparel_devices: 0.04,
  home_sports_toys_tools: 0.03,
  pc_components_dvd: 0.025,
  televisions_digital_games: 0.02,
  grocery_health_consoles: 0.01,
  gift_cards_alcohol: 0.00,
  default: 0.04
};

/**
 * Estimate affiliate commission in USD based on official Amazon Associates rate card.
 * This is a projection from public Amazon Associates rate cards, not reported revenue.
 */
export function estimateCommission(price, category = "") {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const cat = String(category).toLowerCase();
  let rate = OFFICIAL_COMMISSION_RATES.default;

  if (cat.includes("gift card") || cat.includes("alcohol") || cat.includes("cell phone plan")) {
    rate = OFFICIAL_COMMISSION_RATES.gift_cards_alcohol; // 0.0%
  } else if (cat.includes("amazon game") || cat.includes("amazon games")) {
    rate = OFFICIAL_COMMISSION_RATES.amazon_games; // 20.0%
  } else if (cat.includes("luxury") || cat.includes("luxury beauty")) {
    rate = OFFICIAL_COMMISSION_RATES.luxury_beauty; // 10.0%
  } else if (cat.includes("music") || cat.includes("movie") || cat.includes("digital video") || cat.includes("media")) {
    rate = OFFICIAL_COMMISSION_RATES.digital_music_video; // 5.0%
  } else if (cat.includes("book") || cat.includes("kitchen") || cat.includes("automotive") || cat.includes("auto accessory")) {
    rate = OFFICIAL_COMMISSION_RATES.books_kitchen_auto; // 4.5%
  } else if (
    cat.includes("fashion") ||
    cat.includes("apparel") ||
    cat.includes("streetwear") ||
    cat.includes("clothing") ||
    cat.includes("shoe") ||
    cat.includes("watch") ||
    cat.includes("jewelry") ||
    cat.includes("bag") ||
    cat.includes("luggage") ||
    cat.includes("kindle") ||
    cat.includes("echo") ||
    cat.includes("amazon device")
  ) {
    rate = OFFICIAL_COMMISSION_RATES.fashion_apparel_devices; // 4.0%
  } else if (
    cat.includes("toy") ||
    cat.includes("furniture") ||
    cat.includes("home") ||
    cat.includes("garden") ||
    cat.includes("pet") ||
    cat.includes("sport") ||
    cat.includes("fitness") ||
    cat.includes("gym") ||
    cat.includes("baby") ||
    cat.includes("tool") ||
    cat.includes("beauty") ||
    cat.includes("drinkware") ||
    cat.includes("tumbler") ||
    cat.includes("light")
  ) {
    rate = OFFICIAL_COMMISSION_RATES.home_sports_toys_tools; // 3.0%
  } else if (
    cat.includes("pc") ||
    cat.includes("computer") ||
    cat.includes("component") ||
    cat.includes("dvd") ||
    cat.includes("blu-ray")
  ) {
    rate = OFFICIAL_COMMISSION_RATES.pc_components_dvd; // 2.5%
  } else if (
    cat.includes("tv") ||
    cat.includes("television") ||
    cat.includes("digital game") ||
    cat.includes("video game")
  ) {
    rate = OFFICIAL_COMMISSION_RATES.televisions_digital_games; // 2.0%
  } else if (
    cat.includes("grocery") ||
    cat.includes("food") ||
    cat.includes("health") ||
    cat.includes("personal care") ||
    cat.includes("supplement") ||
    cat.includes("protein") ||
    cat.includes("console")
  ) {
    rate = OFFICIAL_COMMISSION_RATES.grocery_health_consoles; // 1.0%
  }

  return parseFloat((amount * rate).toFixed(2));
}

function normalizeTag(affiliateTag) {
  const tag = String(affiliateTag || "").trim();
  return /^[A-Za-z0-9_-]{3,25}$/.test(tag) ? tag : DEFAULT_AFFILIATE_TAG;
}

/** Amazon search URL — the safe fallback for anything unverified. */
export function getAmazonSearchUrl(query, affiliateTag = DEFAULT_AFFILIATE_TAG) {
  const q = String(query || "").trim() || "live stream gear";
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${encodeURIComponent(normalizeTag(affiliateTag))}`;
}

/** Direct product URL for a verified ASIN, otherwise a search URL. */
export function getAmazonProductUrl(asin, title = "", affiliateTag = DEFAULT_AFFILIATE_TAG) {
  if (isVerifiedAsin(asin)) {
    return `https://www.amazon.com/dp/${asin}?tag=${encodeURIComponent(normalizeTag(affiliateTag))}`;
  }
  return getAmazonSearchUrl(title || asin, affiliateTag);
}

/**
 * Remote "add to cart" URL.
 * Accepts a single item or an array, so checkout can carry the whole cart
 * instead of only the first line item.
 */
export function getAmazonCartUrl(items, affiliateTag = DEFAULT_AFFILIATE_TAG) {
  const list = Array.isArray(items) ? items : [items];
  const params = new URLSearchParams({ AssociateTag: normalizeTag(affiliateTag) });

  let index = 0;
  for (const item of list) {
    if (!item || !isVerifiedAsin(item.asin)) continue;
    index += 1;
    params.set(`ASIN.${index}`, item.asin);
    params.set(`Quantity.${index}`, String(Math.max(1, parseInt(item.quantity, 10) || 1)));
    if (index >= 10) break; // Amazon's remote cart caps out well before this
  }

  if (index === 0) {
    const first = list.find((i) => i && (i.title || i.asin));
    return getAmazonSearchUrl(first ? first.title || first.asin : "", affiliateTag);
  }

  return `https://www.amazon.com/gp/aws/cart/add.html?${params.toString()}`;
}

/** Google Shopping comparison URL. */
export function getWebSearchUrl(query) {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(String(query || "").trim())}`;
}

// ===================== MULTI-STORE SEARCH =====================

/** Supported alternative stores for product search. */
export const SUPPORTED_STORES = [
  { id: "google",   label: "Google",   icon: "🔍", color: "#4285F4" },
  { id: "ebay",     label: "eBay",     icon: "🛒", color: "#E53238" },
  { id: "walmart",  label: "Walmart",  icon: "🟡", color: "#0071CE" },
  { id: "bestbuy",  label: "Best Buy", icon: "🔵", color: "#0046BE" },
  { id: "aliexpress", label: "AliExpress", icon: "🛍️", color: "#E62B1E" }
];

/**
 * Build a search URL for a given store.
 * Supports: google, ebay, walmart, bestbuy, aliexpress.
 */
export function getStoreSearchUrl(query, storeId = "google") {
  const q = encodeURIComponent(String(query || "").trim() || "product");
  switch (storeId) {
    case "ebay":
      return `https://www.ebay.com/sch/i.html?_nkw=${q}&_sop=12`;
    case "walmart":
      return `https://www.walmart.com/search?q=${q}`;
    case "bestbuy":
      return `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`;
    case "aliexpress":
      return `https://www.aliexpress.com/w/wholesale-${q.replace(/%20/g, "-")}.html`;
    case "google":
    default:
      return `https://www.google.com/search?tbm=shop&q=${q}`;
  }
}

/**
 * Build search URLs for ALL supported stores at once.
 * Returns an array of { id, label, icon, color, url }.
 */
export function getAllStoreSearchUrls(query) {
  return SUPPORTED_STORES.map((store) => ({
    ...store,
    url: getStoreSearchUrl(query, store.id)
  }));
}
