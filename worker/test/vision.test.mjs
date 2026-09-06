#!/usr/bin/env node
/**
 * Tests for the Workers AI detection layer.
 *
 * Guarantees under test:
 *  - every shape the model actually emits (clean JSON, fenced JSON, prose +
 *    JSON, markdown list) is parsed into detections;
 *  - UI / platform / body-part "products" (TikTok, GrabFood, hand, table…) are
 *    dropped, as are single generic nouns;
 *  - no price or confidence is fabricated when the model did not provide one;
 *  - the model ladder falls through to the next model on failure.
 *
 * Usage: node worker/test/vision.test.mjs
 */

import assert from "node:assert/strict";
import {
  parseModelJson,
  normalizeDetections,
  isJunkTitle,
  detectProducts,
  VISION_MODELS,
  MIN_CONFIDENCE
} from "../src/vision.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

const GOOD = {
  videoTitle: "@techreviewer",
  products: [
    {
      title: "Apple Watch Series 8 45mm",
      brand: "Apple",
      price: 399,
      confidence: 91,
      matchReason: "Digital Crown and rounded rectangular case",
      box_2d: [120, 300, 700, 720]
    }
  ]
};

console.log("\nModel output parsing");

await test("parses a clean JSON object", () => {
  const out = parseModelJson(JSON.stringify(GOOD));
  assert.equal(out.videoTitle, "@techreviewer");
  assert.equal(out.products.length, 1);
  assert.equal(out.products[0].title, "Apple Watch Series 8 45mm");
});

await test("parses fenced JSON with prose around it", () => {
  const text = `Sure! Here is the result:\n\`\`\`json\n${JSON.stringify(GOOD, null, 2)}\n\`\`\`\nLet me know if you need anything else.`;
  const out = parseModelJson(text);
  assert.equal(out.products.length, 1);
  assert.equal(out.videoTitle, "@techreviewer");
});

await test("parses a bare array of products", () => {
  const out = parseModelJson(JSON.stringify(GOOD.products));
  assert.equal(out.products.length, 1);
});

await test("falls back to a markdown list without inventing a high confidence", () => {
  const text = "**Video Title:** @maya\n\n- Title: Stanley Quencher 40oz Tumbler\n  Price: $45.00\n- Title: Table\n";
  const out = parseModelJson(text);
  assert.equal(out.videoTitle, "@maya");
  assert.equal(out.products.length, 2);
  assert.equal(out.products[0].price, 45);
  assert.equal(out.products[0].confidence, MIN_CONFIDENCE);
});

await test("treats 'null' / 'not visible' video titles as empty", () => {
  assert.equal(parseModelJson('{"videoTitle":"Not visible","products":[]}').videoTitle, "");
  assert.equal(parseModelJson('{"videoTitle":null,"products":[]}').videoTitle, "");
});

console.log("\nJunk filtering");

await test("drops apps, platforms and UI elements", () => {
  for (const t of ["TikTok", "GrabFood", "Instagram app", "YouTube logo", "Comment section", "Text overlay", "TikTok Live"]) {
    assert.equal(isJunkTitle(t), true, `${t} should be junk`);
  }
});

await test("drops people, body parts and room furniture", () => {
  for (const t of ["Hand", "Person", "Table", "Wall", "Living room"]) {
    assert.equal(isJunkTitle(t), true, `${t} should be junk`);
  }
});

await test("drops single generic nouns but keeps specific titles", () => {
  assert.equal(isJunkTitle("Phone"), true);
  assert.equal(isJunkTitle("Watch"), true);
  assert.equal(isJunkTitle("Apple Watch Series 8"), false);
  assert.equal(isJunkTitle("AirPods"), false);
  assert.equal(isJunkTitle("Google Pixel 8 Pro"), false);
  assert.equal(isJunkTitle("Ring Video Doorbell"), false);
  assert.equal(isJunkTitle("White ribbed cropped tank top"), false);
});

console.log("\nDetection normalisation");

await test("keeps only what the model can know: no urls, images or asins", () => {
  const { videoTitle, detections } = normalizeDetections(GOOD);
  assert.equal(videoTitle, "@techreviewer");
  assert.equal(detections.length, 1);
  const d = detections[0];
  assert.deepEqual(Object.keys(d).sort(), ["box_2d", "brand", "confidence", "estimatedPrice", "matchReason", "title"]);
  assert.equal(d.estimatedPrice, 399);
  assert.equal(d.confidence, 91);
  assert.deepEqual(d.box_2d, [120, 300, 700, 720]);
});

await test("does not fabricate a price or confidence", () => {
  const { detections } = normalizeDetections({ products: [{ title: "Sony WH-1000XM5 Headphones" }] });
  assert.equal(detections.length, 1);
  assert.equal(detections[0].estimatedPrice, null);
  assert.equal(detections[0].confidence, MIN_CONFIDENCE);
});

await test("filters low confidence, junk and duplicate titles, and caps the list", () => {
  const { detections } = normalizeDetections({
    products: [
      { title: "GrabFood", confidence: 95, price: 373 },
      { title: "Apple Watch Series 8", confidence: 88 },
      { title: "apple watch series 8", confidence: 80 },
      { title: "Blurry thing", confidence: 20 },
      { title: "Table", confidence: 99 },
      { title: "Sony WH-1000XM5", confidence: 0.9 },
      { title: "Stanley Quencher 40oz", confidence: 85 },
      { title: "Elgato Stream Deck MK.2", confidence: 84 },
      { title: "Shure SM7B Microphone", confidence: 83 }
    ]
  });
  assert.deepEqual(
    detections.map((d) => d.title),
    ["Sony WH-1000XM5", "Apple Watch Series 8", "Stanley Quencher 40oz", "Elgato Stream Deck MK.2"]
  );
  assert.equal(detections[0].confidence, 90, "0-1 confidences are scaled to percent");
});

await test("rejects malformed bounding boxes", () => {
  const { detections } = normalizeDetections({
    products: [
      { title: "Apple Watch Series 8", confidence: 90, box_2d: [500, 500, 100, 100] },
      { title: "Sony WH-1000XM5", confidence: 90, box_2d: [1, 2] }
    ]
  });
  assert.equal(detections[0].box_2d, null);
  assert.equal(detections[1].box_2d, null);
});

console.log("\nModel ladder");

await test("uses Llama 4 Scout first with an inline image and parses its reply", async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, payload) {
        calls.push({ model, payload });
        return { response: JSON.stringify(GOOD) };
      }
    }
  };
  const out = await detectProducts(env, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
  assert.equal(out.model, VISION_MODELS.scout);
  assert.equal(calls.length, 1);
  const user = calls[0].payload.messages.find((m) => m.role === "user");
  assert.equal(user.content[1].type, "image_url");
  assert.match(user.content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(out.detections[0].title, "Apple Watch Series 8 45mm");
});

await test("falls through to Llama 3.2 Vision when Scout fails", async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, payload) {
        calls.push(model);
        if (model === VISION_MODELS.scout) throw new Error("model not available");
        assert.ok(Array.isArray(payload.image), "legacy vision payload uses an image byte array");
        return { response: JSON.stringify(GOOD) };
      }
    }
  };
  const out = await detectProducts(env, new Uint8Array([1, 2, 3]));
  assert.equal(out.model, VISION_MODELS.llama32);
  assert.deepEqual(calls, [VISION_MODELS.scout, VISION_MODELS.llama32]);
});

await test("accepts the Meta license prompt once and retries", async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, payload) {
        calls.push(payload);
        if (calls.length === 1) throw new Error("5016: please submit the prompt 'agree' to accept the license");
        return { response: JSON.stringify(GOOD) };
      }
    }
  };
  const out = await detectProducts(env, new Uint8Array([1, 2, 3]));
  assert.equal(out.detections.length, 1);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].messages[0].content, "agree");
});

await test("throws only when every model fails", async () => {
  const env = {
    AI: {
      async run() {
        throw new Error("down");
      }
    }
  };
  await assert.rejects(() => detectProducts(env, new Uint8Array([1])), /Vision models unavailable/);
});

console.log("\nGemini tier");

const realFetch = globalThis.fetch;
function mockGemini(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    return handler(calls.length, String(url));
  };
  return { calls, restore: () => (globalThis.fetch = realFetch) };
}
const geminiOk = (payload) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }]
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

await test("uses Gemini 2.5 Flash first when GEMINI_API_KEY is set, with structured output", async () => {
  const { calls, restore } = mockGemini(() => geminiOk(GOOD));
  const aiCalls = [];
  const env = { GEMINI_API_KEY: "k-server", AI: { async run(m) { aiCalls.push(m); } } };
  try {
    const out = await detectProducts(env, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    assert.equal(out.model, "gemini-2.5-flash");
    assert.equal(aiCalls.length, 0, "Workers AI is not touched when Gemini succeeds");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /models\/gemini-2\.5-flash:generateContent$/);
    assert.equal(calls[0].init.headers["x-goog-api-key"], "k-server");
    const body = calls[0].body;
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.responseSchema.type, "OBJECT");
    assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
    const img = body.contents[0].parts.find((p) => p.inlineData);
    assert.equal(img.inlineData.mimeType, "image/jpeg");
    assert.ok(img.inlineData.data.length > 0);
    assert.ok(body.systemInstruction.parts[0].text.includes("box_2d"));
    assert.equal(out.detections[0].title, "Apple Watch Series 8 45mm");
  } finally {
    restore();
  }
});

await test("X-Gemini-Key (options.geminiKey) overrides the server secret", async () => {
  const { calls, restore } = mockGemini(() => geminiOk(GOOD));
  try {
    await detectProducts({ GEMINI_API_KEY: "k-server" }, new Uint8Array([1]), { geminiKey: "k-user" });
    assert.equal(calls[0].init.headers["x-goog-api-key"], "k-user");
  } finally {
    restore();
  }
});

await test("quota error on the first Gemini model tries the next one, then Workers AI", async () => {
  const { calls, restore } = mockGemini(() => new Response("{}", { status: 429 }));
  const aiCalls = [];
  const env = {
    GEMINI_API_KEY: "k",
    AI: {
      async run(model) {
        aiCalls.push(model);
        return { response: JSON.stringify(GOOD) };
      }
    }
  };
  try {
    const out = await detectProducts(env, new Uint8Array([1]));
    assert.equal(calls.length, 2, "both default Gemini models attempted");
    assert.match(calls[1].url, /gemini-flash-latest/);
    assert.deepEqual(aiCalls, [VISION_MODELS.scout]);
    assert.equal(out.model, VISION_MODELS.scout);
  } finally {
    restore();
  }
});

await test("a rejected key stops the Gemini ladder immediately and falls back", async () => {
  const { calls, restore } = mockGemini(() => new Response("{}", { status: 403 }));
  const env = {
    GEMINI_API_KEY: "bad",
    AI: { async run() { return { response: JSON.stringify(GOOD) }; } }
  };
  try {
    const out = await detectProducts(env, new Uint8Array([1]));
    assert.equal(calls.length, 1, "no point retrying other models with a bad key");
    assert.equal(out.model, VISION_MODELS.scout);
  } finally {
    restore();
  }
});

await test("GEMINI_MODELS overrides the model list", async () => {
  const { calls, restore } = mockGemini(() => geminiOk(GOOD));
  try {
    const out = await detectProducts(
      { GEMINI_API_KEY: "k", GEMINI_MODELS: "gemini-3-flash-preview, gemini-2.5-flash" },
      new Uint8Array([1])
    );
    assert.match(calls[0].url, /gemini-3-flash-preview/);
    assert.equal(out.model, "gemini-3-flash-preview");
  } finally {
    restore();
  }
});

await test("Gemini junk detections are filtered like any other model's", async () => {
  const { restore } = mockGemini(() =>
    geminiOk({
      videoTitle: null,
      products: [
        { title: "TikTok", confidence: 90, matchReason: "logo", box_2d: [0, 0, 100, 100] },
        { title: "Sony WH-1000XM5 Headphones", brand: "Sony", price: 349.99, confidence: 88, matchReason: "earcup shape, logo", box_2d: [200, 300, 600, 700] }
      ]
    })
  );
  try {
    const out = await detectProducts({ GEMINI_API_KEY: "k" }, new Uint8Array([1]));
    assert.equal(out.detections.length, 1);
    assert.equal(out.detections[0].title, "Sony WH-1000XM5 Headphones");
    assert.equal(out.detections[0].estimatedPrice, 349.99);
  } finally {
    restore();
  }
});

await test("without a key and without an AI binding the error says so", async () => {
  await assert.rejects(() => detectProducts({}, new Uint8Array([1])), /no vision backend configured/);
});

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
