#!/usr/bin/env node
/**
 * Tests for the Amazon catalog lookup.
 *
 * The load-bearing guarantee: a detection is only labelled a verified Amazon
 * match when the listing title really overlaps what the vision model saw.
 * Otherwise the client gets a plain search link and *no* image, so it can never
 * show an unrelated listing (or the video frame) as the "Amazon Match".
 *
 * Usage: node worker/test/amazon_lookup.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseAmazonSearchHtml,
  pickBestAmazonMatch,
  scoreTitleMatch,
  upscaleAmazonImage,
  lookupAmazonProduct,
  buildAmazonSearchUrl
} from "../src/amazon_lookup.js";

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

console.log("\nSearch page parsing");

await test("reads ASIN, title, image and price from real search markup", () => {
  const results = parseAmazonSearchHtml(FIXTURE);
  assert.equal(results.length, 3);
  assert.equal(results[0].asin, "B0BS4D5C8D");
  assert.equal(results[0].url, "https://www.amazon.com/dp/B0BS4D5C8D");
  assert.match(results[0].title, /^Apple Watch Series 8 \[GPS, 45mm\]/);
  assert.equal(results[0].price, "$163.29");
  assert.equal(results[0].priceValue, 163.29);
  assert.equal(results[0].imageUrl, "https://m.media-amazon.com/images/I/71XMTLtZd5L._AC_SL400_.jpg");
  assert.equal(results[0].sponsored, false);
});

await test("returns nothing for a CAPTCHA / robot-check page", () => {
  const html = `<html><body><h4>Enter the characters you see below</h4><form action="/errors/validateCaptcha"></form></body></html>`;
  assert.deepEqual(parseAmazonSearchHtml(html), []);
});

await test("ignores blocks without a valid ASIN or title", () => {
  const html =
    `<div data-asin="" data-component-type="s-search-result"><img class="s-image" src="x" alt="No asin"></div>` +
    `<div data-asin="B0TESTASIN" data-component-type="s-search-result"><img class="s-image" src="x" alt=""></div>`;
  assert.deepEqual(parseAmazonSearchHtml(html), []);
});

await test("upscales grid thumbnails to the 400px listing image", () => {
  assert.equal(
    upscaleAmazonImage("https://m.media-amazon.com/images/I/61abc._AC_SX148_SY213_QL70_.jpg"),
    "https://m.media-amazon.com/images/I/61abc._AC_SL400_.jpg"
  );
  assert.equal(upscaleAmazonImage("https://m.media-amazon.com/images/I/61abc.jpg"), "https://m.media-amazon.com/images/I/61abc.jpg");
  assert.equal(upscaleAmazonImage(null), null);
});

console.log("\nTitle matching");

await test("scores overlap on meaningful tokens only", () => {
  assert.equal(scoreTitleMatch("Apple Watch Series 8", "Apple Watch Series 8 [GPS, 45mm] - Midnight"), 1);
  assert.ok(scoreTitleMatch("Sony WH-1000XM5 Headphones", "Sony WH-1000XM5 Wireless Noise Canceling Headphones") >= 0.99);
  assert.equal(scoreTitleMatch("GrabFood", "Apple Watch Series 8 [GPS, 45mm]"), 0);
  assert.equal(scoreTitleMatch("", "anything"), 0);
});

await test("a different model number can never verify, a different size still can", () => {
  assert.ok(scoreTitleMatch("Apple Watch Series 9", "Apple Watch Series 8 [GPS]") < 0.5);
  assert.ok(scoreTitleMatch("Sony WH-1000XM4", "Sony WH-1000XM5 Headphones") < 0.5);
  assert.ok(scoreTitleMatch("Apple Watch Series 8 45mm", "Apple Watch Series 8 [GPS, 41mm]") >= 0.75);
});

await test("picks the best-overlapping organic listing", () => {
  const results = parseAmazonSearchHtml(FIXTURE);
  const match = pickBestAmazonMatch("Apple Watch Series 8 45mm Midnight", results);
  assert.equal(match.asin, "B0BS4D5C8D");
  assert.equal(match.matchScore, 100);
});

await test("prefers organic results over sponsored ones at equal overlap", () => {
  const results = [
    { asin: "B0SPONSOR1", title: "Stanley Quencher 40oz Tumbler", sponsored: true },
    { asin: "B0ORGANIC1", title: "Stanley Quencher 40oz Tumbler", sponsored: false }
  ];
  assert.equal(pickBestAmazonMatch("Stanley Quencher 40oz Tumbler", results).asin, "B0ORGANIC1");
});

await test("refuses a weak match instead of returning a random listing", () => {
  const results = parseAmazonSearchHtml(FIXTURE);
  assert.equal(pickBestAmazonMatch("GrabFood delivery bag", results), null);
  assert.equal(pickBestAmazonMatch("Gaming monitor desk setup", results), null);
});

console.log("\nLookup");

const memoryKv = () => {
  const store = new Map();
  return {
    store,
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

await test("builds a plain amazon.com search URL", () => {
  assert.equal(buildAmazonSearchUrl("Apple Watch Series 8"), "https://www.amazon.com/s?k=Apple%20Watch%20Series%208");
});

await test("resolves a verified listing and caches it", async () => {
  const CACHE = memoryKv();
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, text: async () => FIXTURE };
  };

  const first = await lookupAmazonProduct("Apple Watch Series 8", { CACHE }, { fetchImpl });
  assert.equal(first.asin, "B0BS4D5C8D");
  assert.equal(first.price, "$163.29");
  assert.match(first.imageUrl, /_AC_SL400_/);

  const second = await lookupAmazonProduct("apple watch series 8", { CACHE }, { fetchImpl });
  assert.equal(second.asin, "B0BS4D5C8D");
  assert.equal(calls, 1, "second lookup should be served from KV");
});

await test("returns null (never throws) on network failure, block page or no overlap", async () => {
  const failing = async () => {
    throw new Error("connect timeout");
  };
  assert.equal(await lookupAmazonProduct("Apple Watch Series 8", {}, { fetchImpl: failing }), null);

  const blocked = async () => ({ ok: true, text: async () => "<html>Robot Check</html>" });
  assert.equal(await lookupAmazonProduct("Apple Watch Series 8", {}, { fetchImpl: blocked }), null);

  const fine = async () => ({ ok: true, text: async () => FIXTURE });
  assert.equal(await lookupAmazonProduct("GrabFood", {}, { fetchImpl: fine }), null);
});

await test("skips lookups for titles with no meaningful tokens", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, text: async () => FIXTURE };
  };
  assert.equal(await lookupAmazonProduct("a of", {}, { fetchImpl }), null);
  assert.equal(calls, 0);
});

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
