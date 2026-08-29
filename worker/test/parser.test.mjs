#!/usr/bin/env node
/**
 * Tests for the Lens result parser.
 *
 * The load-bearing guarantee: an Amazon URL without a resolvable ASIN must never
 * be returned as a product. That is the same rule the extension enforces, and it
 * is what keeps hallucinated or unparseable results from becoming dead links.
 *
 * Usage: node worker/test/parser.test.mjs
 */

import assert from "node:assert/strict";
import {
  parseLensResponse,
  parsePrice,
  extractAsin,
  isAmazonUrl
} from "../src/parser.js";

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

console.log("\nASIN extraction");

test("reads an ASIN from every Amazon URL form", () => {
  assert.equal(extractAsin("https://www.amazon.com/dp/B0002E4Z8M"), "B0002E4Z8M");
  assert.equal(extractAsin("https://www.amazon.com/gp/product/B09XS7JWHH/ref=x"), "B09XS7JWHH");
  assert.equal(extractAsin("https://www.amazon.co.uk/Some-Title/dp/B07W755322?th=1"), "B07W755322");
  assert.equal(extractAsin("https://www.amazon.com/gp/aw/d/B08PZHYWJS"), "B08PZHYWJS");
  assert.equal(extractAsin("https://www.amazon.com/s?asin=B0B94ZDFM9"), "B0B94ZDFM9");
});

test("rejects anything that is not a real ASIN", () => {
  assert.equal(extractAsin("https://www.amazon.com/s?k=headphones"), null);
  // Ten characters in a /dp/ path is not enough; ASINs start with B0.
  assert.equal(extractAsin("https://example.com/dp/1234567890"), null);
  assert.equal(extractAsin("https://www.amazon.com/dp/XXXXXXXXXX"), null);
  assert.equal(extractAsin(null), null);
});

test("recognizes Amazon domains but not lookalikes", () => {
  assert.equal(isAmazonUrl("https://www.amazon.com/dp/B0002E4Z8M"), true);
  assert.equal(isAmazonUrl("https://amazon.co.uk/dp/B0002E4Z8M"), true);
  assert.equal(isAmazonUrl("https://www.amazon.de/dp/B0002E4Z8M"), true);
  assert.equal(isAmazonUrl("https://notamazon.com/dp/B0002E4Z8M"), false);
  assert.equal(isAmazonUrl("https://amazon.com.evil.co/dp/B0002E4Z8M"), false);
  assert.equal(isAmazonUrl("not a url"), false);
});

console.log("\nPrice parsing");

test("handles the formats Lens actually returns", () => {
  assert.equal(parsePrice("$49.99").price, 49.99);
  assert.equal(parsePrice("USD 1,299.00").price, 1299);
  assert.equal(parsePrice("1.299,00 €").price, 1299);
  assert.equal(parsePrice(348).price, 348);
  assert.equal(parsePrice({ value: "$45.00", currency: "USD" }).price, 45);
});

test("reads currency where present", () => {
  assert.equal(parsePrice("$49.99").currency, "USD");
  assert.equal(parsePrice("1.299,00 €").currency, "EUR");
  assert.equal(parsePrice("£29.99").currency, "GBP");
});

test("returns null rather than guessing", () => {
  assert.equal(parsePrice(null).price, null);
  assert.equal(parsePrice("See price in cart").price, null);
  assert.equal(parsePrice(0).price, null);
  assert.equal(parsePrice(-5).price, null);
});

console.log("\nResponse parsing");

test("extracts Amazon products from a products-array response", () => {
  const { amazon } = parseLensResponse({
    products: [
      {
        title: "Sony WH-1000XM5 Headphones",
        link: "https://www.amazon.com/dp/B09XS7JWHH",
        price: "$348.00",
        thumbnail: "https://m.media-amazon.com/images/I/x.jpg",
        source: "Amazon.com"
      }
    ]
  });
  assert.equal(amazon.length, 1);
  assert.equal(amazon[0].asin, "B09XS7JWHH");
  assert.equal(amazon[0].price, 348);
  assert.equal(amazon[0].verified, true);
});

test("drops Amazon results with no resolvable ASIN", () => {
  const { amazon, others } = parseLensResponse({
    products: [
      { title: "Some Hoodie", link: "https://www.amazon.com/s?k=hoodie", price: "$38.50" }
    ]
  });
  assert.equal(amazon.length, 0, "a search URL is not a product");
  assert.equal(others.length, 0, "and it is not a non-Amazon retailer either");
});

test("separates other retailers from Amazon", () => {
  const { amazon, others } = parseLensResponse({
    visual_matches: [
      { title: "Nike Hoodie", link: "https://www.nike.com/t/hoodie", price: "$90.00" },
      { title: "Sony XM5", link: "https://www.amazon.com/dp/B09XS7JWHH", price: "$348.00" }
    ]
  });
  assert.equal(amazon.length, 1);
  assert.equal(others.length, 1);
  assert.equal(others[0].source, "nike.com");
});

test("finds results under an unexpected container", () => {
  // Guards against upstream schema drift.
  const { amazon } = parseLensResponse({
    data: { some_new_key: { entries: [
      { name: "Stanley Tumbler", page_url: "https://www.amazon.com/dp/B0B94ZDFM9", current_price: 45 }
    ] } }
  });
  assert.equal(amazon.length, 1);
  assert.equal(amazon[0].asin, "B0B94ZDFM9");
});

test("deduplicates repeated ASINs", () => {
  const { amazon } = parseLensResponse({
    products: [
      { title: "Sony XM5", link: "https://www.amazon.com/dp/B09XS7JWHH" },
      { title: "Sony WH-1000XM5", link: "https://www.amazon.com/gp/product/B09XS7JWHH" }
    ]
  });
  assert.equal(amazon.length, 1);
});

test("orders priced results ahead of unpriced ones", () => {
  const { amazon } = parseLensResponse({
    products: [
      { title: "No price", link: "https://www.amazon.com/dp/B0002E4Z8M" },
      { title: "Has price", link: "https://www.amazon.com/dp/B09XS7JWHH", price: "$348.00" }
    ]
  });
  assert.equal(amazon[0].title, "Has price");
});

test("survives empty, malformed and hostile input", () => {
  assert.deepEqual(parseLensResponse(null).amazon, []);
  assert.deepEqual(parseLensResponse({}).amazon, []);
  assert.deepEqual(parseLensResponse({ products: "not an array" }).amazon, []);
  assert.deepEqual(parseLensResponse({ products: [{ title: "no link" }] }).amazon, []);
});

test("does not recurse forever on a self-referencing payload", () => {
  const cyclic = { products: [] };
  cyclic.self = cyclic;
  const { amazon } = parseLensResponse(cyclic);
  assert.deepEqual(amazon, []);
});

console.log(`\n${failed ? "✗" : "✓"} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
