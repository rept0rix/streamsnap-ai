/**
 * StreamSnap Worker — frame → product detections via Workers AI.
 *
 * Used when Bright Data / Google Lens is not configured (the mobile live scan
 * path). The model is only asked to *name and locate* physical products; the
 * Amazon listing itself is resolved afterwards by amazon_lookup.js, so nothing
 * here is allowed to invent ASINs, catalog images or "found on Amazon" prices.
 *
 * Model ladder: Llama 4 Scout (natively multimodal, far better at reading brand
 * text than Llama 3.2 Vision) → Llama 3.2 11B Vision → LLaVA 1.5.
 */

export const VISION_MODELS = {
  scout: "@cf/meta/llama-4-scout-17b-16e-instruct",
  llama32: "@cf/meta/llama-3.2-11b-vision-instruct",
  llava: "@cf/llava-hf/llava-1.5-7b-hf"
};

export const MIN_CONFIDENCE = 65;
export const MAX_PRODUCTS = 4;

export const VISION_SYSTEM_PROMPT = `You are StreamSnap, a visual product spotter for shopping from short videos and live streams.
The image is a frame captured from a phone screen while the viewer watches a video app (TikTok, Instagram Reels, YouTube). It may contain the app's own interface: buttons, captions, usernames, comments, emojis, music info, progress bars.

Your job: list the PHYSICAL consumer products that are clearly visible in the video content and that a viewer could buy online — electronics, gadgets, phone accessories, headphones, watches, apparel, shoes, bags, jewelry, beauty and skincare, supplements, packaged food or drinks, kitchenware, home decor, toys, tools, fitness gear, pet products, and similar.

Strict rules:
1. NEVER list apps, websites, platforms, delivery services, logos, watermarks, on-screen text, captions, stickers, emojis, buttons or any user-interface element (no "TikTok", "Instagram", "GrabFood", "YouTube", "text overlay", "comment", etc.).
2. NEVER list people, body parts, animals, food dishes being eaten, rooms, walls, floors, windows, doors, furniture that is part of the room, vehicles, scenery or generic background objects.
3. Be as specific as the pixels allow. Use brand + model/line when the branding is readable or unmistakable (e.g. "Apple Watch Series 9 45mm", "Stanley Quencher H2.0 40oz Tumbler", "Sony WH-1000XM5 Headphones"). If the brand is not identifiable, write a precise, searchable descriptive title (e.g. "White ribbed cropped tank top", "Clear acrylic makeup organizer with drawers"). Never answer with a single generic word such as "phone", "watch", "shirt", "bottle".
4. "confidence" is your honest 0-100 estimate that a shopper searching your title on Amazon would find this exact product. Do not include anything under ${MIN_CONFIDENCE}.
5. "box_2d" is [ymin, xmin, ymax, xmax] on a 0-1000 scale, tight around the product only.
6. "price" is your estimate of the typical US retail price in USD as a plain number (e.g. 249.99) or null if you cannot estimate it. It is only a hint; never fabricate certainty.
7. "matchReason" is one short sentence naming the visual cues you used (logo, shape, packaging, text).
8. At most ${MAX_PRODUCTS} products, most prominent first. Merge duplicates of the same item.
9. If a creator handle (@name) or the video caption is readable, put it in "videoTitle", otherwise null.
10. If nothing shoppable is visible, return {"videoTitle": null, "products": []}.

Respond with ONLY this JSON object and nothing else — no markdown, no commentary:
{"videoTitle": string|null, "products": [{"title": string, "brand": string|null, "price": number|null, "confidence": number, "matchReason": string, "box_2d": [number, number, number, number]}]}`;

export const VISION_USER_PROMPT = "Identify the shoppable physical products in this video frame. Output only the JSON object.";

// Titles the model should never have produced but sometimes does anyway.
const PLATFORM_RE =
  /\b(tik\s?tok|instagram|youtube|yt\s?shorts|snapchat|facebook|twitter|whatsapp|telegram|twitch|grab\s?food|uber\s?eats|door\s?dash|deliveroo|foodpanda|shopee|lazada|temu|shein|aliexpress|netflix|spotify|apple\s?music|google chrome|safari browser|app store|play store|iphone\s?screen)\b/i;

const UI_RE =
  /\b(app|application|website|logo|watermark|icon|button|caption|subtitle|comment|comments|username|user\s?name|handle|hashtag|emoji|sticker|banner|overlay|text|screenshot|screen recording|user interface|ui|menu|notification|progress bar|timestamp|thumbnail|video|livestream|live stream|stream|advertisement|ad)\b/i;

const NON_PRODUCT_RE =
  /^(person|people|human|man|woman|boy|girl|child|baby|face|hand|hands|finger|fingers|arm|leg|hair|skin|body|dog|cat|pet|animal|table|desk|plate|bowl|dish|meal|food|wall|floor|ceiling|room|door|window|curtain|background|scenery|sky|cloud|tree|water|building|road|street|car|vehicle|bed|sofa|couch|chair|kitchen|bathroom|living room|bedroom)$/i;

const GENERIC_SINGLE_WORD_RE =
  /^(phone|smartphone|mobile|watch|smartwatch|shirt|t-shirt|tshirt|top|dress|pants|jeans|shoes|shoe|sneakers|bag|bottle|cup|mug|glass|box|package|product|item|device|gadget|laptop|computer|monitor|screen|tv|television|camera|headphones|earbuds|speaker|keyboard|mouse|tablet|charger|cable|case|hat|cap|jacket|hoodie|sweater|socks|ring|necklace|bracelet|sunglasses|glasses|lipstick|makeup|cream|lotion|perfume|candle|pillow|blanket|towel|toy|book|pen|notebook)$/i;

/**
 * Pull the model's JSON out of whatever it actually returned: a clean object,
 * a ```json fenced block, prose around an object, or (last resort) a markdown
 * list. Returns { videoTitle, products } with raw, unvalidated product objects.
 */
export function parseModelJson(text) {
  const clean = String(text || "")
    .replace(/```(?:json)?/gi, "")
    .trim();

  let videoTitle = "";
  const products = [];

  const absorb = (parsed) => {
    if (!parsed || typeof parsed !== "object") return false;
    if (Array.isArray(parsed)) {
      const before = products.length;
      for (const p of parsed) if (p?.title) products.push(p);
      return products.length > before;
    }
    if (typeof parsed.videoTitle === "string" && !videoTitle && !/not visible|none|n\/a|null|unknown/i.test(parsed.videoTitle)) {
      videoTitle = parsed.videoTitle.trim();
    }
    if (Array.isArray(parsed.products)) {
      for (const p of parsed.products) if (p?.title) products.push(p);
      return true;
    }
    if (parsed.title) {
      products.push(parsed);
      return true;
    }
    return false;
  };

  // 1. The whole response is JSON.
  try {
    if (absorb(JSON.parse(clean))) return { videoTitle, products };
  } catch {}

  // 2. JSON embedded in prose: take the outermost {...} span.
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      if (absorb(JSON.parse(clean.slice(first, last + 1)))) return { videoTitle, products };
    } catch {}
  }

  // 3. Individual flat objects scattered in the text.
  for (const block of clean.match(/\{[^{}]+\}/g) || []) {
    try {
      absorb(JSON.parse(block));
    } catch {}
  }
  if (products.length > 0) return { videoTitle, products };

  // 4. Markdown-ish list ("Title: X ... Price: $Y"). No confidence is invented
  //    here; unparsed items get a low score so they only survive when nothing
  //    better exists and still fall under the caller's threshold.
  const stripped = clean.replace(/[*_#]/g, "");
  const vt = stripped.match(/(?:Video Title|Creator|Handle|Username):\s*([^\n]+)/i);
  if (vt && !/not visible|none|n\/a|null/i.test(vt[1])) videoTitle = vt[1].trim();

  const itemRegex = /(?:^|\n)\s*(?:[•\-+*]|\d+[.)])?\s*Title:\s*([^\n]+)(?:[\s\S]*?Price:\s*\$?([0-9.]+))?/gi;
  let m;
  while ((m = itemRegex.exec(stripped)) !== null) {
    const title = m[1].trim();
    if (/creator|handle|caption|video title|not visible|none|n\/a/i.test(title)) continue;
    products.push({ title, price: m[2] ? Number(m[2]) : null, confidence: MIN_CONFIDENCE });
  }

  return { videoTitle, products };
}

export function isJunkTitle(title) {
  const t = String(title || "").trim();
  if (t.length < 3) return true;
  if (NON_PRODUCT_RE.test(t)) return true;
  if (PLATFORM_RE.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length === 1 && GENERIC_SINGLE_WORD_RE.test(t)) return true;
  // "TikTok app", "comment section", "text overlay" — short titles whose head
  // or modifier is a UI word describe the screen, not a product.
  if (words.length <= 3 && UI_RE.test(words[words.length - 1])) return true;
  if (words.length <= 2 && UI_RE.test(words[0])) return true;
  return false;
}

function normalizeTitleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toPriceNumber(raw) {
  if (raw == null || raw === "") return null;
  const value = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 && value < 100000 ? Math.round(value * 100) / 100 : null;
}

function toConfidence(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const pct = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(99, Math.round(pct)));
}

function toBox(raw) {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const nums = raw.slice(0, 4).map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [ymin, xmin, ymax, xmax] = nums.map((n) => Math.max(0, Math.min(1000, n)));
  if (ymax <= ymin || xmax <= xmin) return null;
  return [ymin, xmin, ymax, xmax];
}

/**
 * Validate and clean raw model detections. Output items carry only what the
 * model can legitimately know: title, brand, estimated price, confidence, box,
 * reason. No URLs, images or ASINs — those come from the catalog lookup.
 */
export function normalizeDetections(raw, { minConfidence = MIN_CONFIDENCE, maxProducts = MAX_PRODUCTS } = {}) {
  const list = Array.isArray(raw?.products) ? raw.products : [];
  const videoTitle = String(raw?.videoTitle || "").trim();
  const seen = new Set();
  const detections = [];

  for (const item of list) {
    const title = String(item?.title || "")
      .replace(/\s+/g, " ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    if (isJunkTitle(title)) continue;

    const key = normalizeTitleKey(title);
    if (!key || seen.has(key)) continue;

    const confidence = toConfidence(item?.confidence ?? item?.similarityScore);
    // Missing confidence is treated as the floor, not as certainty.
    const effective = confidence ?? minConfidence;
    if (effective < minConfidence) continue;

    seen.add(key);
    detections.push({
      title,
      brand: typeof item?.brand === "string" && item.brand.trim() ? item.brand.trim() : null,
      estimatedPrice: toPriceNumber(item?.price),
      confidence: effective,
      matchReason:
        typeof item?.matchReason === "string" && item.matchReason.trim()
          ? item.matchReason.trim().slice(0, 160)
          : null,
      box_2d: toBox(item?.box_2d)
    });
  }

  detections.sort((a, b) => b.confidence - a.confidence);
  return { videoTitle, detections: detections.slice(0, maxProducts) };
}

function detectMime(bytes) {
  if (bytes?.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes?.length > 11 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return "image/jpeg";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function responseText(response) {
  if (!response) return "";
  if (typeof response === "string") return response;
  if (typeof response.response === "string") return response.response;
  if (response.response && typeof response.response === "object") return JSON.stringify(response.response);
  const choice = response.choices?.[0]?.message?.content;
  if (typeof choice === "string") return choice;
  if (typeof response.result === "string") return response.result;
  if (typeof response.description === "string") return response.description;
  return "";
}

/**
 * Workers AI refuses some Meta models until the account has accepted the
 * license; the error asks us to "submit the prompt 'agree'". Do that once and
 * retry rather than surfacing the failure to every user.
 */
async function runWithLicenseRetry(env, model, payload, agreePayload) {
  try {
    return await env.AI.run(model, payload);
  } catch (err) {
    const message = String(err?.message || err);
    if (!message.includes("5016") && !/submit the prompt ['"]agree['"]/i.test(message)) throw err;
    await env.AI.run(model, agreePayload);
    return env.AI.run(model, payload);
  }
}

async function runScout(env, bytes) {
  const dataUrl = `data:${detectMime(bytes)};base64,${bytesToBase64(bytes)}`;
  const payload = {
    messages: [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: VISION_USER_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } }
        ]
      }
    ],
    max_tokens: 900,
    temperature: 0.1
  };
  return runWithLicenseRetry(env, VISION_MODELS.scout, payload, {
    messages: [{ role: "user", content: "agree" }]
  });
}

async function runLlama32(env, bytes) {
  const payload = {
    prompt: `${VISION_SYSTEM_PROMPT}\n\n${VISION_USER_PROMPT}`,
    image: Array.from(bytes),
    max_tokens: 900,
    temperature: 0.1
  };
  return runWithLicenseRetry(env, VISION_MODELS.llama32, payload, { prompt: "agree" });
}

async function runLlava(env, bytes) {
  return env.AI.run(VISION_MODELS.llava, {
    image: Array.from(bytes),
    prompt: `${VISION_SYSTEM_PROMPT}\n\n${VISION_USER_PROMPT}`,
    max_tokens: 700
  });
}

/**
 * Run the vision ladder on a frame. Resolves to
 * { videoTitle, detections, model, rawText }. Throws only if every model fails.
 */
export async function detectProducts(env, bytes, options = {}) {
  const ladder = [
    ["scout", runScout],
    ["llama32", runLlama32],
    ["llava", runLlava]
  ];
  const errors = [];

  for (const [name, run] of ladder) {
    let text;
    try {
      text = responseText(await run(env, bytes));
    } catch (err) {
      errors.push(`${name}: ${err?.message || err}`);
      console.log(`[vision] ${name} failed:`, err?.message || err);
      continue;
    }
    if (!text.trim()) {
      errors.push(`${name}: empty response`);
      continue;
    }
    const { videoTitle, detections } = normalizeDetections(parseModelJson(text), options);
    return { videoTitle, detections, model: VISION_MODELS[name], rawText: text };
  }

  throw new Error(`Vision models unavailable (${errors.join(" | ")})`);
}
