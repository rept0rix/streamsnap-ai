#!/usr/bin/env node
/**
 * CORS tests.
 *
 * Two failure modes, in opposite directions:
 *
 *   Too strict  -> the website's credentialed fetch('/auth/me') is blocked and
 *                  every visitor appears signed out.
 *   Too loose   -> any website can read a signed-in session from the API.
 *
 * The browser rule that drives all of this: with credentials: "include", the
 * response must name one exact origin and set Allow-Credentials. A wildcard is
 * rejected, and echoing an unlisted origin hands the session to whoever asked.
 *
 * Usage: node worker/test/cors.test.mjs
 */

import assert from "node:assert/strict";

// Mirrors corsHeaders in src/index.js. Kept in sync deliberately: extracting it
// would mean importing a module that pulls in Workers-only globals.
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const base = {
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };

  if (origin && allowed.includes(origin)) {
    return {
      ...base,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true"
    };
  }
  if (allowed.length === 0) {
    return { ...base, "Access-Control-Allow-Origin": origin || "*" };
  }
  return base;
}

const req = (origin) => new Request("https://api.test/auth/me", {
  headers: origin ? { Origin: origin } : {}
});

const env = { ALLOWED_ORIGINS: "https://streamsnap.online,https://www.streamsnap.online" };

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

console.log("\nAllowed origins");

test("a listed origin gets itself back, with credentials enabled", () => {
  const h = corsHeaders(req("https://streamsnap.online"), env);
  assert.equal(h["Access-Control-Allow-Origin"], "https://streamsnap.online");
  assert.equal(h["Access-Control-Allow-Credentials"], "true");
});

test("the www host is handled too", () => {
  const h = corsHeaders(req("https://www.streamsnap.online"), env);
  assert.equal(h["Access-Control-Allow-Origin"], "https://www.streamsnap.online");
  assert.equal(h["Access-Control-Allow-Credentials"], "true");
});

test("Authorization is permitted, since the extension sends a bearer token", () => {
  const h = corsHeaders(req("https://streamsnap.online"), env);
  assert.ok(h["Access-Control-Allow-Headers"].includes("Authorization"));
});

test("DELETE is permitted, since account deletion uses it", () => {
  const h = corsHeaders(req("https://streamsnap.online"), env);
  assert.ok(h["Access-Control-Allow-Methods"].includes("DELETE"));
});

console.log("\nRejected origins");

test("an unlisted origin gets no Allow-Origin at all", () => {
  const h = corsHeaders(req("https://evil.com"), env);
  assert.equal(h["Access-Control-Allow-Origin"], undefined);
  assert.equal(h["Access-Control-Allow-Credentials"], undefined);
});

test("an unlisted origin is never answered with someone else's origin", () => {
  // The earlier bug: falling back to allowed[0] told evil.com that
  // streamsnap.online was allowed, which is confusing rather than safe.
  const h = corsHeaders(req("https://evil.com"), env);
  assert.notEqual(h["Access-Control-Allow-Origin"], "https://streamsnap.online");
});

test("a suffix lookalike is not treated as the real origin", () => {
  for (const bad of [
    "https://evil-streamsnap.online",
    "https://streamsnap.online.evil.com",
    "http://streamsnap.online"
  ]) {
    const h = corsHeaders(req(bad), env);
    assert.equal(h["Access-Control-Allow-Origin"], undefined, `${bad} must be rejected`);
  }
});

console.log("\nUnconfigured deployment");

test("an empty allowlist permits reads but never credentials", () => {
  const bare = { ALLOWED_ORIGINS: "" };
  const h = corsHeaders(req("https://anything.dev"), bare);
  assert.equal(h["Access-Control-Allow-Origin"], "https://anything.dev");
  assert.equal(
    h["Access-Control-Allow-Credentials"],
    undefined,
    "a misconfigured deployment must not become an open credentialed API"
  );
});

test("Vary: Origin is always present, so caches do not cross origins", () => {
  for (const origin of ["https://streamsnap.online", "https://evil.com", ""]) {
    assert.equal(corsHeaders(req(origin), env).Vary, "Origin");
  }
});

console.log(`\n${failed ? "✗" : "✓"} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
