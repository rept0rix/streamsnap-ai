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
    image: "https://m.media-amazon.com/images/I/71P4q+HqKQL._AC_SL1500_.jpg"
  },
  B09XS7JWHH: {
    asin: "B09XS7JWHH",
    title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
    brand: "Sony",
    category: "Headphones",
    price: 348.0,
    image: "https://m.media-amazon.com/images/I/61vJtKbAssL._AC_SL1500_.jpg"
  },
  B07W755322: {
    asin: "B07W755322",
    title: "Elgato Key Light — 2800 Lumen Studio LED Panel",
    brand: "Elgato",
    category: "Studio Lighting",
    price: 199.99,
    image: "https://m.media-amazon.com/images/I/61LpX3fXQAL._AC_SL1500_.jpg"
  },
  B07W5JK7B6: {
    asin: "B07W5JK7B6",
    title: "Elgato Stream Deck MK.2 — 15 Macro Keys Studio Controller",
    brand: "Elgato",
    category: "Gaming & Gear",
    price: 149.99,
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
    price: 549.0,
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
    price: 39.99,
    image: "https://m.media-amazon.com/images/I/71j1n-1Pq-L._AC_SL1500_.jpg"
  },
  B0HGDV476B: {
    asin: "B0HGDV476B",
    title: "Ninja HydraSense Intelligent Water Filtration System",
    brand: "Ninja",
    category: "Home & Kitchen",
    price: 199.99,
    image: "https://m.media-amazon.com/images/I/71UqI4pWv1L._AC_SL1500_.jpg"
  },
  B08285CV9C: {
    asin: "B08285CV9C",
    title: "Replacement Analog 3D Thumbstick Joystick for Controller",
    brand: "Generic",
    category: "Gaming & Gear",
    price: 9.99,
    image: "https://m.media-amazon.com/images/I/61k2YfR1L-L._AC_SL1500_.jpg"
  },
  B0FRY24FNG: {
    asin: "B0FRY24FNG",
    title: "The Complete Matrix Trilogy (3-Pack 4K Ultra HD)",
    brand: "Warner Bros",
    category: "Movies & Media",
    price: 49.99,
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
      image: byTitle.image,
      category: byTitle.category,
      verified: true
    };
  }

  // Unverified: keep the visual detection, drop the unconfirmed ASIN and price.
  return {
    ...item,
    asin: null,
    title,
    price: typeof item.price === "number" && item.price > 0 ? item.price : null,
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
 * Estimate affiliate commission in USD.
 * This is a projection from public Amazon Associates rate cards, not reported
 * revenue. Call sites must label it as an estimate.
 */
export function estimateCommission(price, category = "") {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const cat = String(category).toLowerCase();
  let rate = 0.04;
  if (cat.includes("apparel") || cat.includes("streetwear") || cat.includes("costume")) rate = 0.07;
  else if (cat.includes("drinkware") || cat.includes("fitness") || cat.includes("gym")) rate = 0.05;
  else if (cat.includes("audio") || cat.includes("headphone") || cat.includes("gaming")) rate = 0.03;

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
