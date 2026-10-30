#!/usr/bin/env node
/**
 * StreamSnap AI — Centralized Version Bumper
 *
 * Automatically updates the version across ALL files in the codebase,
 * synchronizes release timestamps, validates the build, and packages
 * the distribution zip files.
 *
 * Usage:
 *   node tools/bump_version.mjs 1.6.4
 *   node tools/bump_version.mjs --patch   (bumps 1.6.3 -> 1.6.4)
 *   node tools/bump_version.mjs --minor   (bumps 1.6.3 -> 1.7.0)
 *   node tools/bump_version.mjs --major   (bumps 1.6.3 -> 2.0.0)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function write(rel, content) {
  writeFileSync(join(ROOT, rel), content, "utf8");
}

// 1. Determine new version
const manifest = JSON.parse(read("extension/manifest.json"));
const currentVersion = manifest.version || "1.6.3";

let targetVersion = process.argv[2];

if (!targetVersion || targetVersion === "--patch") {
  const parts = currentVersion.split(".").map(Number);
  parts[2] = (parts[2] || 0) + 1;
  targetVersion = parts.join(".");
} else if (targetVersion === "--minor") {
  const parts = currentVersion.split(".").map(Number);
  parts[1] = (parts[1] || 0) + 1;
  parts[2] = 0;
  targetVersion = parts.join(".");
} else if (targetVersion === "--major") {
  const parts = currentVersion.split(".").map(Number);
  parts[0] = (parts[0] || 0) + 1;
  parts[1] = 0;
  parts[2] = 0;
  targetVersion = parts.join(".");
}

if (!/^\d+\.\d+\.\d+$/.test(targetVersion)) {
  console.error(`Invalid version format: "${targetVersion}". Expected X.Y.Z semver.`);
  process.exit(1);
}

const now = new Date();
const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
const hours = String(now.getHours()).padStart(2, "0");
const minutes = String(now.getMinutes()).padStart(2, "0");
const timeStr = `${hours}:${minutes}`;
const timestampStr = `${dateStr} ${timeStr}:00 IDT`;

console.log(`\n🚀 Bumping StreamSnap version: v${currentVersion} → v${targetVersion} (${timestampStr})\n`);

// --- 2. Update extension/manifest.json ---
console.log("  → extension/manifest.json");
manifest.version = targetVersion;
write("extension/manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// --- 3. Update extension/services/version_info.js ---
console.log("  → extension/services/version_info.js");
let vInfo = read("extension/services/version_info.js");
vInfo = vInfo.replace(
  /export const CURRENT_BUILD = \{[\s\S]*?\n\};/,
  `export const CURRENT_BUILD = {
  version: "${targetVersion}",
  buildDate: "${dateStr}",
  buildTime: "${timeStr}",
  buildTimestamp: "${timestampStr}",
  title: "Permission Hardening, Force-Update Gate & Live Security",
  highlights: [
    "🔒 Permissions Fixed: Added <all_urls> host access for background capture from Side Panel & video overlay.",
    "⚡ Force-Update Gate: Outdated extension builds are automatically detected and prompted to update.",
    "🛡️ Active Tab Window Mapping: Explicit window targeting for seamless video frame capture."
  ]
};`
);
// Prepend to VERSION_HISTORY if not already there
if (!vInfo.includes(`version: "${targetVersion}"`)) {
  vInfo = vInfo.replace(
    /export const VERSION_HISTORY = \[\n/,
    `export const VERSION_HISTORY = [\n  CURRENT_BUILD,\n`
  );
}
write("extension/services/version_info.js", vInfo);

// --- 4. Update extension/content/content.js ---
console.log("  → extension/content/content.js");
let contentJs = read("extension/content/content.js");
contentJs = contentJs.replace(
  /Active Build: v\d+\.\d+\.\d+ \([^)]+\)/,
  `Active Build: v${targetVersion} (${dateStr} ${timeStr} IDT)`
);
contentJs = contentJs.replace(
  /StreamSnap AI v\d+\.\d+\.\d+ \([^)]+\)/g,
  `StreamSnap AI v${targetVersion} (${dateStr} ${timeStr})`
);
write("extension/content/content.js", contentJs);

// --- 5. Update extension/services/account.js ---
console.log("  → extension/services/account.js");
let accountJs = read("extension/services/account.js");
accountJs = accountJs.replace(
  /Chrome Extension v\d+\.\d+\.\d+/,
  `Chrome Extension v${targetVersion}`
);
write("extension/services/account.js", accountJs);

// --- 6. Update extension/sidepanel/sidepanel.html ---
console.log("  → extension/sidepanel/sidepanel.html");
let sidepanelHtml = read("extension/sidepanel/sidepanel.html");
sidepanelHtml = sidepanelHtml.replace(
  /<span class="version-pill-tag" id="panel-version-tag">v\d+\.\d+\.\d+<\/span>/,
  `<span class="version-pill-tag" id="panel-version-tag">v${targetVersion}</span>`
);
sidepanelHtml = sidepanelHtml.replace(
  /<span id="footer-version-tag" class="footer-version-badge" title="StreamSnap AI v\d+\.\d+\.\d+ Built [^"]+">v\d+\.\d+\.\d+ \([^)]+\)<\/span>/,
  `<span id="footer-version-tag" class="footer-version-badge" title="StreamSnap AI v${targetVersion} Built ${timestampStr}">v${targetVersion} (${dateStr} ${timeStr})</span>`
);
write("extension/sidepanel/sidepanel.html", sidepanelHtml);

// --- 7. Update worker/src/index.js ---
console.log("  → worker/src/index.js");
let workerIndex = read("worker/src/index.js");
workerIndex = workerIndex.replace(
  /const FALLBACK_MIN_EXTENSION_VERSION = "\d+\.\d+\.\d+";/,
  `const FALLBACK_MIN_EXTENSION_VERSION = "${targetVersion}";`
);
workerIndex = workerIndex.replace(
  /const LATEST_EXTENSION_VERSION = "\d+\.\d+\.\d+";/,
  `const LATEST_EXTENSION_VERSION = "${targetVersion}";`
);
write("worker/src/index.js", workerIndex);

// --- 8. Update worker/wrangler.toml ---
console.log("  → worker/wrangler.toml");
let wranglerToml = read("worker/wrangler.toml");
wranglerToml = wranglerToml.replace(
  /MIN_EXTENSION_VERSION = "\d+\.\d+\.\d+"/,
  `MIN_EXTENSION_VERSION = "${targetVersion}"`
);
write("worker/wrangler.toml", wranglerToml);

// --- 9. Update landing_page/index.html ---
console.log("  → landing_page/index.html");
let landingHtml = read("landing_page/index.html");
landingHtml = landingHtml.replace(
  /<span class="dynamic-version">\d+\.\d+\.\d+<\/span>/g,
  `<span class="dynamic-version">${targetVersion}</span>`
);
landingHtml = landingHtml.replace(
  /streamsnap-extension-v\d+\.\d+\.\d+\.zip/g,
  `streamsnap-extension-v${targetVersion}.zip`
);
write("landing_page/index.html", landingHtml);

// --- 10. Update landing_page/account.html ---
console.log("  → landing_page/account.html");
let accountHtml = read("landing_page/account.html");
accountHtml = accountHtml.replace(
  /<strong class="dynamic-version"[^>]*>\d+\.\d+\.\d+<\/strong>/g,
  `<strong class="dynamic-version" style="color:#FFF;">${targetVersion}</strong>`
);
write("landing_page/account.html", accountHtml);

// --- 11. Update landing_page/admin.js ---
console.log("  → landing_page/admin.js");
let adminJs = read("landing_page/admin.js");
adminJs = adminJs.replace(
  /Chrome Extension v\d+\.\d+\.\d+/g,
  `Chrome Extension v${targetVersion}`
);
write("landing_page/admin.js", adminJs);

// --- 12. Update landing_page/promo-video.html ---
console.log("  → landing_page/promo-video.html");
let promoHtml = read("landing_page/promo-video.html");
promoHtml = promoHtml.replace(
  /StreamSnap AI v\d+\.\d+\.\d+ Active/g,
  `StreamSnap AI v${targetVersion} Active`
);
write("landing_page/promo-video.html", promoHtml);

// --- 13. Update CHROMEWEBSTORE.md ---
console.log("  → CHROMEWEBSTORE.md");
let storeMd = read("CHROMEWEBSTORE.md");
storeMd = storeMd.replace(
  /- \*\*Current Version:\*\* `\d+\.\d+\.\d+`/,
  `- **Current Version:** \`${targetVersion}\``
);
storeMd = storeMd.replace(
  /streamsnap-extension-v\d+\.\d+\.\d+\.zip/g,
  `streamsnap-extension-v${targetVersion}.zip`
);
write("CHROMEWEBSTORE.md", storeMd);

// --- 14. Update CHANGELOG.md ---
console.log("  → CHANGELOG.md");
let changelog = read("CHANGELOG.md");
if (!changelog.includes(`## [${targetVersion}]`)) {
  const newEntry = `## [${targetVersion}] - ${dateStr} (${timeStr} IDT)
### Fixed & Changed
- **Permissions**: Added \`<all_urls>\` to \`host_permissions\` so \`captureVisibleTab\` works reliably from Side Panel and video controls.
- **Active Tab Window Targeting**: Service worker resolves the focused browser window ID when capturing frames from the side panel.
- **Force-Update Gate**: Set server minimum required version to **${targetVersion}** so older builds (e.g. 1.6.3) receive a prompt to update.
- **Automated Versioning**: Centralized single-command bump script across all repository assets.

`;
  changelog = changelog.replace(/(# Changelog[^\n]*\n\n)/, `$1${newEntry}`);
  write("CHANGELOG.md", changelog);
}

console.log("\n✓ All file references updated successfully.");

// --- 15. Run validations, tests and package ---
console.log("\nRunning validation and packaging...");
try {
  execSync("node tools/validate.mjs", { cwd: ROOT, stdio: "inherit" });
  execSync("node tools/test.mjs", { cwd: ROOT, stdio: "inherit" });
  execSync("bash tools/package.sh", { cwd: ROOT, stdio: "inherit" });
  console.log(`\n🎉 Successfully bumped and packaged StreamSnap AI v${targetVersion}!`);
} catch (err) {
  console.error("\n❌ Build or test failure during bump:", err.message);
  process.exit(1);
}
