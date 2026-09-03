#!/usr/bin/env node
/**
 * End-to-end test of POST /resolve on the Workers AI path.
 *
 * Guarantee: what the client receives as an "Amazon match" is a real listing
 * (ASIN + catalog image + listing price) whose title overlaps the detection;
 * unverified detections carry a search link and no image; UI junk never
 * reaches the client.
 *
 * Usage: node worker/test/resolve.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import worker from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(here, "fixtures_amazon_search.html"), "utf8");

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

const memoryKv = () => {
  const store = new Map();
  return {
    async get(key, type) {
      const v = store.get(key);
      if (v == null) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key, value) {
      store.set(key, value);
    }
  };
};

const MODEL_REPLY = {
  videoTitle: "@gadgetgirl",
  products: [
    { title: "Apple Watch Series 8", brand: "Apple", price: 399, confidence: 91, matchReason: "Digital Crown", box_2d: [100, 200, 600, 700] },
    { title: "GrabFood", price: 373, confidence: 90, matchReason: "App logo" },
    { title: "Table", confidence: 99 },
    { title: "Curved ultrawide gaming monitor", price: 350, confidence: 78, matchReason: "Wide curved panel" }
  ]
};

function makeEnv(aiReply = MODEL_REPLY) {
  return {
    CACHE: memoryKv(),
    AI: {
      async run() {
        return { response: JSON.stringify(aiReply) };
      }
    }
  };
}

const ctx = { waitUntil() {} };
const TINY_JPEG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString("base64");

async function callResolve(env, extraHeaders = {}) {
  const request = new Request("https://worker.test/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ image: TINY_JPEG, installId: "test-install-0001" })
  });
  const response = await worker.fetch(request, env, ctx);
  return { status: response.status, body: await response.json() };
}

const geminiCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.startsWith("https://www.amazon.com/s?k=")) {
    return new Response(FIXTURE, { status: 200, headers: { "Content-Type": "text/html" } });
  }
  if (href.startsWith("https://generativelanguage.googleapis.com/")) {
    geminiCalls.push({ href, headers: init.headers });
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(MODEL_REPLY) }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  throw new Error(`unexpected fetch: ${href}`);
};

console.log("\nPOST /resolve (Workers AI engine)");

await test("returns a verified Amazon listing with catalog image and live price", async () => {
  const { status, body } = await callResolve(makeEnv());
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.engine, "workers-ai");
  assert.equal(body.visionModel, "@cf/meta/llama-4-scout-17b-16e-instruct");

  assert.equal(body.amazon.length, 1);
  const watch = body.amazon[0];
  assert.equal(watch.title, "Apple Watch Series 8");
  assert.equal(watch.asin, "B0BS4D5C8D");
  assert.equal(watch.url, "https://www.amazon.com/dp/B0BS4D5C8D");
  assert.match(watch.imageUrl, /^https:\/\/m\.media-amazon\.com\/images\/I\/71XMTLtZd5L\._AC_SL400_\.jpg$/);
  assert.equal(watch.image, watch.imageUrl);
  assert.equal(watch.thumbnail, watch.imageUrl);
  assert.equal(watch.price, "$163.29", "listing price wins over the model's estimate");
  assert.equal(watch.priceValue, 163.29);
  assert.equal(watch.priceEstimated, false);
  assert.equal(watch.verified, true);
  assert.equal(watch.confidence, 91);
  assert.equal(watch.matchScore, 100);
  assert.match(watch.matchedTitle, /^Apple Watch Series 8/);
  assert.deepEqual(watch.box_2d, [100, 200, 600, 700]);
  assert.equal(watch.videoTitle, "@gadgetgirl");
  assert.equal(watch.videoUrl, "https://www.tiktok.com/@gadgetgirl");
  // Tiny fixture JPEG is too small to crop — sourceCrop stays null, which is fine.
  assert.equal(watch.sourceCrop, null);
});

await test("unverified detections get a search link, an estimated price and NO image", async () => {
  const { body } = await callResolve(makeEnv());
  assert.equal(body.others.length, 1);
  const monitor = body.others[0];
  assert.equal(monitor.title, "Curved ultrawide gaming monitor");
  assert.equal(monitor.asin, null);
  assert.equal(monitor.url, "https://www.amazon.com/s?k=Curved%20ultrawide%20gaming%20monitor");
  assert.equal(monitor.imageUrl, null);
  assert.equal(monitor.image, null);
  assert.equal(monitor.price, "$350.00");
  assert.equal(monitor.priceEstimated, true);
  assert.equal(monitor.verified, false);
});

await test("UI junk (GrabFood, Table) never reaches the client", async () => {
  const { body } = await callResolve(makeEnv());
  const titles = body.products.map((p) => p.title);
  assert.ok(!titles.includes("GrabFood"));
  assert.ok(!titles.includes("Table"));
  assert.equal(body.count, 2);
  assert.deepEqual(body.products, [...body.amazon, ...body.others]);
});

await test("an empty frame yields an empty, successful result", async () => {
  const { status, body } = await callResolve(makeEnv({ videoTitle: null, products: [] }));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.count, 0);
  assert.deepEqual(body.products, []);
});

console.log("\nPOST /resolve (Gemini engine)");

await test("with GEMINI_API_KEY the frame goes to Gemini and the same verified listing comes back", async () => {
  geminiCalls.length = 0;
  const env = { ...makeEnv(), GEMINI_API_KEY: "server-key" };
  env.AI.run = async () => { throw new Error("Workers AI must not be called when Gemini succeeds"); };
  const { status, body } = await callResolve(env);
  assert.equal(status, 200);
  assert.equal(body.engine, "gemini");
  assert.equal(body.visionModel, "gemini-2.5-flash");
  assert.equal(geminiCalls.length, 1);
  assert.equal(geminiCalls[0].headers["x-goog-api-key"], "server-key");
  assert.equal(body.amazon[0].asin, "B0BS4D5C8D");
  assert.equal(body.amazon[0].verified, true);
  assert.equal(body.others.length, 1);
});

await test("X-Gemini-Key lets a caller bring their own key (and is CORS-allowed)", async () => {
  geminiCalls.length = 0;
  const env = { ...makeEnv(), GEMINI_API_KEY: "server-key" };
  const { body } = await callResolve(env, { "X-Gemini-Key": "user-key" });
  assert.equal(body.engine, "gemini");
  assert.equal(geminiCalls[0].headers["x-goog-api-key"], "user-key");

  const preflight = await worker.fetch(
    new Request("https://worker.test/resolve", {
      method: "OPTIONS",
      headers: { Origin: "https://example.com", "Access-Control-Request-Headers": "x-gemini-key" }
    }),
    env,
    ctx
  );
  assert.match(preflight.headers.get("Access-Control-Allow-Headers") || "", /X-Gemini-Key/);
});

await test("attaches a sourceCrop data URL when the frame is large enough to crop", async () => {
  // Build a real 120x120 JPEG so box_2d [100,200,600,700] yields a usable crop.
  const { default: jpeg } = await import("jpeg-js");
  const w = 120, h = 120;
  const data = new Uint8Array(w * h * 4);
  data.fill(200);
  const encoded = new Uint8Array(jpeg.encode({ data, width: w, height: h }, 85).data);
  const dataUrl = "data:image/jpeg;base64," + Buffer.from(encoded).toString("base64");

  const env = makeEnv();
  const request = new Request("https://worker.test/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl, installId: "test-install-0001" })
  });
  const response = await worker.fetch(request, env, ctx);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.amazon.length, 1);
  assert.match(body.amazon[0].sourceCrop, /^data:image\/jpeg;base64,/);
  assert.ok(body.amazon[0].sourceCrop.length > 64);
});

await test("with Bright Data, Lens runs on product crops and can upgrade a miss", async () => {
  const lensCalls = [];
  const images = new Map();
  const env = {
    ...makeEnv(),
    BRIGHTDATA_API_KEY: "bd-key",
    BRIGHTDATA_ZONE: "serp",
    PUBLIC_BASE_URL: "https://worker.test",
    IMAGES: {
      async put(k, v) { images.set(k, v); },
      async delete(k) { images.delete(k); },
      async get(k) { return images.has(k) ? { body: images.get(k) } : null; }
    },
    AI: {
      async run() {
        // Monitor stays unverified against the Apple Watch fixture → Lens can promote it.
        return {
          response: JSON.stringify({
            videoTitle: null,
            products: [
              { title: "Curved ultrawide gaming monitor", confidence: 88, matchReason: "curve", box_2d: [100, 100, 800, 800] }
            ]
          })
        };
      }
    }
  };

  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.startsWith("https://www.amazon.com/s?k=")) {
      return new Response(FIXTURE, { status: 200, headers: { "Content-Type": "text/html" } });
    }
    if (href === "https://api.brightdata.com/request") {
      lensCalls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        products: [{
          title: "SAMSUNG 49-Inch Odyssey G9 Gaming Monitor",
          link: "https://www.amazon.com/dp/B08D6J2P48",
          price: "$999.00",
          image: "https://m.media-amazon.com/images/I/monitor.jpg"
        }]
      }), { status: 200 });
    }
    throw new Error("unexpected fetch: " + href);
  };

  try {
    const { default: jpeg } = await import("jpeg-js");
    const w = 160, h = 160;
    const data = new Uint8Array(w * h * 4); data.fill(180);
    const encoded = new Uint8Array(jpeg.encode({ data, width: w, height: h }, 85).data);
    const dataUrl = "data:image/jpeg;base64," + Buffer.from(encoded).toString("base64");
    const request = new Request("https://worker.test/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, installId: "test-install-0001" })
    });
    const response = await worker.fetch(request, env, ctx);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(lensCalls.length, 1, "Lens called once on the crop");
    assert.match(lensCalls[0].url, /lens\.google\.com\/uploadbyurl/);
    assert.equal(body.engine, "workers-ai+lens");
    assert.equal(body.lensCrops, 1);
    assert.equal(body.amazon.length, 1);
    assert.equal(body.amazon[0].asin, "B08D6J2P48");
    assert.equal(body.amazon[0].verified, true);
    assert.equal(body.others.length, 0);
  } finally {
    globalThis.fetch = real;
  }
});

globalThis.fetch = realFetch;

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
