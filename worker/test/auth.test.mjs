#!/usr/bin/env node
/**
 * Auth tests.
 *
 * The load-bearing check is isAllowedReturnUrl. The extension tells the server
 * where to send the session token, and that parameter travels through the
 * browser, so an attacker can set it. If validation is loose, an attacker gets
 * a link that hands them a signed-in session for whoever clicks it. Every case
 * below is a way that has gone wrong in real OAuth deployments.
 *
 * Usage: node worker/test/auth.test.mjs
 */

import assert from "node:assert/strict";
import { isAllowedReturnUrl } from "../src/routes_auth.js";

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

// A real Chrome extension id is 32 chars, a-p.
const EXT = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/";
const env = { ALLOWED_ORIGINS: "https://streamsnap.ai,https://app.streamsnap.ai" };

console.log("\nAccepted return targets");

test("the extension's own chromiumapp URL", () => {
  assert.equal(isAllowedReturnUrl(EXT, env), true);
});

test("a configured web origin", () => {
  assert.equal(isAllowedReturnUrl("https://streamsnap.ai/dashboard", env), true);
  assert.equal(isAllowedReturnUrl("https://app.streamsnap.ai/", env), true);
});

console.log("\nRejected return targets");

test("an arbitrary attacker domain", () => {
  assert.equal(isAllowedReturnUrl("https://evil.com/steal", env), false);
});

test("a lookalike that merely ends with the real host", () => {
  // The classic suffix-match bug.
  assert.equal(isAllowedReturnUrl("https://evil-streamsnap.ai/", env), false);
  assert.equal(isAllowedReturnUrl("https://streamsnap.ai.evil.com/", env), false);
});

test("a lookalike of the chromiumapp domain", () => {
  assert.equal(
    isAllowedReturnUrl("https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org.evil.com/", env),
    false
  );
  assert.equal(isAllowedReturnUrl("https://evil.chromiumapp.org.attacker.net/", env), false);
});

test("a chromiumapp host with an invalid extension id", () => {
  // Extension ids use a-p only, and are exactly 32 characters.
  assert.equal(isAllowedReturnUrl("https://short.chromiumapp.org/", env), false);
  assert.equal(
    isAllowedReturnUrl("https://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.chromiumapp.org/", env),
    false,
    "letters beyond 'p' are not valid in an extension id"
  );
});

test("plain http, even on an allowed host", () => {
  assert.equal(isAllowedReturnUrl("http://streamsnap.ai/", env), false);
  assert.equal(
    isAllowedReturnUrl("http://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/", env),
    false
  );
});

test("non-http schemes that could execute", () => {
  assert.equal(isAllowedReturnUrl("javascript:alert(1)", env), false);
  assert.equal(isAllowedReturnUrl("data:text/html,<script>", env), false);
  assert.equal(isAllowedReturnUrl("file:///etc/passwd", env), false);
});

test("malformed and empty input", () => {
  assert.equal(isAllowedReturnUrl("", env), false);
  assert.equal(isAllowedReturnUrl(null, env), false);
  assert.equal(isAllowedReturnUrl(undefined, env), false);
  assert.equal(isAllowedReturnUrl("not a url", env), false);
  assert.equal(isAllowedReturnUrl("//evil.com", env), false);
  assert.equal(isAllowedReturnUrl(12345, env), false);
});

test("everything is rejected when no origins are configured", () => {
  // A blank ALLOWED_ORIGINS must not mean "allow anything" — only the
  // extension's own redirect target stays valid.
  const bare = { ALLOWED_ORIGINS: "" };
  assert.equal(isAllowedReturnUrl("https://streamsnap.ai/", bare), false);
  assert.equal(isAllowedReturnUrl(EXT, bare), true);
});

console.log(`\n${failed ? "✗" : "✓"} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
