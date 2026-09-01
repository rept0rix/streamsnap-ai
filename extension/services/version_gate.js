/**
 * StreamSnap AI — version gate.
 *
 * Chrome updates extensions on its own schedule, which can be days. When a build
 * ships a fix that must not be bypassed (a broken scan path, a privacy change, a
 * server contract change), waiting for Chrome is not good enough. The server
 * advertises the oldest build it still accepts via GET /version; if this build
 * is older, the panel refuses to run and tells the user to update.
 *
 * Fail-open on the network: if the server cannot be reached we do NOT block, so
 * a worker outage never bricks the extension. But once we have positively seen
 * that this build is too old, we remember it (gateBlocked) and keep blocking
 * even offline — an outdated build should not become usable just by pulling the
 * network cable.
 */

import { CURRENT_BUILD } from "./version_info.js";
import { getApiBase } from "./account.js";

const GATE_CACHE_KEY = "versionGate";

/** Compare two "a.b.c" strings. Returns -1, 0, or 1 (a<b, a==b, a>b). */
export function compareVersions(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/**
 * Decide whether this build is allowed to run.
 *
 * @returns {Promise<{blocked: boolean, currentVersion: string,
 *   minVersion: string|null, latestVersion: string|null, updateUrl: string,
 *   reachable: boolean}>}
 */
export async function checkVersionGate() {
  const currentVersion = CURRENT_BUILD.version;
  const updateUrlDefault = "https://streamsnap.online";

  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/version`, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) throw new Error(`Server returned ${response.status}`);

    const data = await response.json();
    const minVersion = data.minVersion || null;
    const latestVersion = data.latestVersion || null;
    const updateUrl = data.updateUrl || updateUrlDefault;

    const blocked =
      Boolean(minVersion) && compareVersions(currentVersion, minVersion) < 0;

    // Remember the verdict so an outdated build stays blocked even if the
    // network later disappears.
    await chrome.storage.local.set({
      [GATE_CACHE_KEY]: {
        blocked,
        minVersion,
        latestVersion,
        updateUrl,
        checkedAt: Date.now()
      }
    });

    return {
      blocked,
      currentVersion,
      minVersion,
      latestVersion,
      updateUrl,
      reachable: true
    };
  } catch {
    // Offline / server down. Fall back to the last known verdict; only block if
    // we already positively knew this build was too old.
    const { [GATE_CACHE_KEY]: cached } = await chrome.storage.local.get([
      GATE_CACHE_KEY
    ]);

    const blocked =
      Boolean(cached?.blocked) &&
      Boolean(cached?.minVersion) &&
      compareVersions(currentVersion, cached.minVersion) < 0;

    return {
      blocked,
      currentVersion,
      minVersion: cached?.minVersion || null,
      latestVersion: cached?.latestVersion || null,
      updateUrl: cached?.updateUrl || updateUrlDefault,
      reachable: false
    };
  }
}
