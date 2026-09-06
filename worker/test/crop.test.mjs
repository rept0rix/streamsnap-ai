#!/usr/bin/env node
/**
 * Tests for box_2d JPEG cropping.
 * Usage: node worker/test/crop.test.mjs
 */

import assert from "node:assert/strict";
import jpeg from "jpeg-js";
import { cropJpegByBox, cropToDataUrl } from "../src/crop.js";

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

/** Solid-color JPEG (width x height), RGBA filled with a vertical gradient. */
function makeJpeg(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((x / width) * 255);
      data[i + 1] = Math.round((y / height) * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return new Uint8Array(jpeg.encode({ data, width, height }, 90).data);
}

console.log("\nJPEG crop by box_2d");

await test("crops the centre of a frame to a smaller JPEG", () => {
  const frame = makeJpeg(200, 100);
  // Centre half: ymin=250, xmin=250, ymax=750, xmax=750 on 0–1000
  const crop = cropJpegByBox(frame, [250, 250, 750, 750], { margin: 0 });
  assert.ok(crop);
  assert.ok(crop.length > 32);
  assert.ok(crop[0] === 0xff && crop[1] === 0xd8, "JPEG SOI marker");
  const decoded = jpeg.decode(crop, { useTArray: true });
  assert.equal(decoded.width, 100);
  assert.equal(decoded.height, 50);
});

await test("applies a margin around the box", () => {
  const frame = makeJpeg(200, 200);
  const tight = cropJpegByBox(frame, [400, 400, 600, 600], { margin: 0 });
  const padded = cropJpegByBox(frame, [400, 400, 600, 600], { margin: 0.1 });
  const a = jpeg.decode(tight, { useTArray: true });
  const b = jpeg.decode(padded, { useTArray: true });
  assert.ok(b.width > a.width);
  assert.ok(b.height > a.height);
});

await test("returns null for a malformed box or tiny region", () => {
  const frame = makeJpeg(100, 100);
  assert.equal(cropJpegByBox(frame, null), null);
  assert.equal(cropJpegByBox(frame, [1, 2]), null);
  assert.equal(cropJpegByBox(frame, [500, 500, 100, 100]), null);
  assert.equal(cropJpegByBox(frame, [499, 499, 501, 501], { minEdge: 24 }), null);
});

await test("cropToDataUrl returns a usable data URL", () => {
  const frame = makeJpeg(80, 80);
  const url = cropToDataUrl(frame, [100, 100, 900, 900], { margin: 0 });
  assert.match(url, /^data:image\/jpeg;base64,/);
  const b64 = url.replace(/^data:image\/jpeg;base64,/, "");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
});

console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
