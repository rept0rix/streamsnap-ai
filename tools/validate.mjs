#!/usr/bin/env node
/**
 * StreamSnap AI — build validator.
 *
 * Catches the class of mistakes that only surface when you load the unpacked
 * extension in Chrome: a manifest that references a deleted file, an ES module
 * importing something that no longer exists, an HTML id the JS expects but the
 * markup does not have, or a permission Chrome will reject.
 *
 * Usage: node tools/validate.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXT = join(ROOT, "extension");

const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

function read(path) {
  return readFileSync(path, "utf8");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// --- 1. Manifest ----------------------------------------------------------

let manifest;
try {
  manifest = JSON.parse(read(join(EXT, "manifest.json")));
} catch (err) {
  fail(`manifest.json is not valid JSON: ${err.message}`);
  report();
}

if (manifest.manifest_version !== 3) fail("manifest_version must be 3.");
if (!/^\d+\.\d+(\.\d+)?(\.\d+)?$/.test(manifest.version || "")) {
  fail(`Invalid version string: ${manifest.version}`);
}
if ((manifest.description || "").length > 132) {
  fail(`description is ${manifest.description.length} chars; Chrome caps it at 132.`);
}

// Broad permissions are the most common review rejection.
const broad = [
  ...(manifest.host_permissions || []),
  ...(manifest.content_scripts || []).flatMap((cs) => cs.matches || [])
].filter((m) => m === "<all_urls>" || m === "*://*/*");
if (broad.length) {
  fail(`Broad host match found (${broad[0]}). Chrome Web Store review requires narrow, justified hosts.`);
}

// Every path the manifest points at must exist.
const referenced = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((cs) => [...(cs.js || []), ...(cs.css || [])])
].filter(Boolean);

for (const rel of referenced) {
  if (!existsSync(join(EXT, rel))) fail(`manifest references a missing file: ${rel}`);
}

// --- 2. JavaScript syntax + module graph ----------------------------------

const jsFiles = walk(EXT).filter((f) => f.endsWith(".js"));

for (const file of jsFiles) {
  const source = read(file);
  const rel = relative(ROOT, file);

  // Parse check via Node's own ESM parser. Content scripts are classic
  // scripts but still parse cleanly as modules, so one pass covers both.
  const check = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: source,
    encoding: "utf8"
  });
  if (check.status !== 0) {
    const detail = (check.stderr || "").split("\n").find((l) => /Error/.test(l)) || "parse failed";
    fail(`${rel}: ${detail.trim()}`);
  }

  // Resolve relative imports.
  for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const target = resolve(dirname(file), match[1]);
    if (!existsSync(target)) {
      fail(`${rel}: imports "${match[1]}" which does not exist.`);
    }
  }

  // Service worker sanity: no DOM globals, no long-lived timers.
  if (file.includes("background/") || file.includes("services/")) {
    if (/\bdocument\.(createElement|querySelector|getElementById)\b/.test(source)) {
      fail(`${rel}: uses \`document\` — unavailable in an MV3 service worker.`);
    }
    if (/\bsetInterval\s*\(/.test(source)) {
      fail(`${rel}: uses setInterval — the service worker is evicted when idle. Use chrome.alarms.`);
    }
  }

  // Flag interpolation of dynamic values into innerHTML.
  for (const m of source.matchAll(/\.innerHTML\s*=\s*`[^`]*\$\{/g)) {
    const line = source.slice(0, m.index).split("\n").length;
    fail(`${rel}:${line}: template interpolation into innerHTML — XSS risk. Use textContent.`);
  }
}

// --- 3. HTML ids referenced by JS ----------------------------------------

const htmlFiles = walk(EXT).filter((f) => f.endsWith(".html"));
const availableIds = new Set();
for (const file of htmlFiles) {
  for (const m of read(file).matchAll(/\bid="([^"]+)"/g)) availableIds.add(m[1]);
}

for (const file of jsFiles) {
  const source = read(file);
  const rel = relative(ROOT, file);
  for (const m of source.matchAll(/(?:getElementById|byId)\(\s*["']([^"']+)["']\s*\)/g)) {
    if (!availableIds.has(m[1])) {
      warn(`${rel}: looks up #${m[1]}, which no HTML file defines.`);
    }
  }
}

// --- 4. Secrets -----------------------------------------------------------

for (const file of [...jsFiles, ...htmlFiles]) {
  const source = read(file);
  if (/AIza[0-9A-Za-z_-]{30,}/.test(source)) {
    fail(`${relative(ROOT, file)}: contains what looks like a hardcoded Google API key.`);
  }
}

// --- 5. Fabricated identifiers -------------------------------------------

for (const file of jsFiles) {
  const source = read(file);
  if (/["'`]B0\$\{|`B0\$\{/.test(source) || /"B0"\s*\+\s*Math\.random/.test(source)) {
    fail(`${relative(ROOT, file)}: generates a synthetic ASIN. Never fabricate product identifiers.`);
  }
}

report();

function report() {
  for (const w of warnings) console.warn(`  warn  ${w}`);
  for (const e of errors) console.error(`  FAIL  ${e}`);

  if (errors.length) {
    console.error(`\n✗ ${errors.length} error(s), ${warnings.length} warning(s)\n`);
    process.exit(1);
  }
  console.log(
    `✓ extension validated — ${jsFiles.length} JS files, ${htmlFiles.length} HTML files, ${warnings.length} warning(s)\n`
  );
  process.exit(0);
}
