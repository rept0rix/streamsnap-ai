#!/usr/bin/env node
/**
 * StreamSnap AI — behavioural tests for the commerce layer.
 *
 * The central guarantee is that a hallucinated ASIN from the vision model can
 * never turn into a deep link to a product page. These tests lock that in.
 *
 * Usage: node tools/test.mjs
 */

import assert from "node:assert/strict";
import {
  resolveDetection,
  getAmazonProductUrl,
  getAmazonCartUrl,
  isVerifiedAsin,
  estimateCommission,
  categorizeProduct
} from "../extension/services/amazon_service.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

console.log("\nASIN handling");

test("a model-hallucinated ASIN is stripped, not trusted", () => {
  const result = resolveDetection({
    title: "Some Unknown Gadget",
    asin: "B0FAKE1234", // well-formed but not a real listing
    price: 49.99,
    confidence: 0.95
  });
  assert.equal(result.asin, null);
  assert.equal(result.verified, false);
});

test("an unverified detection never yields a /dp/ deep link", () => {
  const result = resolveDetection({ title: "Mystery Hoodie", asin: "B0ZZZZZZZZ" });
  const url = getAmazonProductUrl(result.asin, result.title);
  assert.ok(!url.includes("/dp/"), `expected a search URL, got ${url}`);
  assert.ok(url.includes("/s?k="));
});

test("a verified ASIN is upgraded to canonical catalog data", () => {
  const result = resolveDetection({ title: "shure sm7b mic", asin: "B0002E4Z8M", price: 1.0 });
  assert.equal(result.verified, true);
  assert.equal(result.asin, "B0002E4Z8M");
  assert.equal(result.price, 399.0); // model's bogus price is overridden
});

test("title matching recovers a verified product when no ASIN is given", () => {
  const result = resolveDetection({ title: "Sony WH-1000XM5 over-ear headphones" });
  assert.equal(result.verified, true);
  assert.equal(result.asin, "B09XS7JWHH");
});

test("brand alone does not force a false verified match", () => {
  const result = resolveDetection({ title: "Sony television remote control" });
  assert.equal(result.verified, false);
  assert.equal(result.asin, null);
});

test("an unpriced detection stays unpriced rather than defaulting to 29.99", () => {
  const result = resolveDetection({ title: "Unbranded desk lamp" });
  assert.equal(result.price, null);
});

test("an empty detection is rejected", () => {
  assert.equal(resolveDetection({ title: "   " }), null);
  assert.equal(resolveDetection(null), null);
});

console.log("\nCart URLs");

test("cart URL carries every verified item, not just the first", () => {
  const url = getAmazonCartUrl([
    { asin: "B0002E4Z8M", quantity: 2 },
    { asin: "B09XS7JWHH", quantity: 1 },
    { asin: "B08PZHYWJS", quantity: 3 }
  ]);
  assert.ok(url.includes("ASIN.1=B0002E4Z8M"));
  assert.ok(url.includes("ASIN.2=B09XS7JWHH"));
  assert.ok(url.includes("ASIN.3=B08PZHYWJS"));
  assert.ok(url.includes("Quantity.1=2"));
});

test("cart URL drops unverified items instead of linking to dead ASINs", () => {
  const url = getAmazonCartUrl([
    { asin: "B0FAKE0000", quantity: 1 },
    { asin: "B0002E4Z8M", quantity: 1 }
  ]);
  assert.ok(!url.includes("B0FAKE0000"));
  assert.ok(url.includes("ASIN.1=B0002E4Z8M"));
});

test("an all-unverified cart falls back to search", () => {
  const url = getAmazonCartUrl([{ asin: null, title: "Olive hoodie", quantity: 1 }]);
  assert.ok(url.includes("/s?k="));
  assert.ok(url.includes("Olive"));
});

test("a malformed affiliate tag falls back to the default", () => {
  const url = getAmazonProductUrl("B0002E4Z8M", "", "bad tag with spaces!");
  assert.ok(url.includes("tag=streamsnap03-20"));
});

test("query strings are escaped", () => {
  const url = getAmazonProductUrl(null, 'Hoodie "XL" & <script>');
  assert.ok(!url.includes("<script>"));
  assert.ok(!url.includes('"'));
});

console.log("\nHelpers");

test("isVerifiedAsin rejects malformed and unknown ASINs", () => {
  assert.equal(isVerifiedAsin("B0002E4Z8M"), true);
  assert.equal(isVerifiedAsin("B0FAKE1234"), false);
  assert.equal(isVerifiedAsin("not-an-asin"), false);
  assert.equal(isVerifiedAsin(null), false);
});

test("commission is zero for an unknown price rather than a made-up number", () => {
  assert.equal(estimateCommission(null, "Headphones"), 0);
  assert.equal(estimateCommission("abc", "Headphones"), 0);
  assert.equal(estimateCommission(-5, "Headphones"), 0);
});

test("commission rate varies by category", () => {
  assert.equal(estimateCommission(100, "Streetwear & Apparel"), 7.0);
  assert.equal(estimateCommission(100, "Headphones"), 3.0);
  assert.equal(estimateCommission(100, "General Gear"), 4.0);
});

test("categorization matches known product families", () => {
  assert.equal(categorizeProduct("Adjustable Dumbbell Set"), "Gym & Fitness");
  assert.equal(categorizeProduct("Stanley Quencher Tumbler"), "Drinkware");
  assert.equal(categorizeProduct("Nondescript object"), "General Gear");
});

console.log(`\n${failed ? "✗" : "✓"} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
