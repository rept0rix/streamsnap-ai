// Unit-style test of per-tab save -> restore (background saveTabScan + panel
// showTabScan/renderScanResults guard), extracted from the real sources.
import fs from "node:fs";
import assert from "node:assert/strict";

const bg = fs.readFileSync(new URL("../extension/background/background.js", import.meta.url), "utf8");
const sp = fs.readFileSync(new URL("../extension/sidepanel/sidepanel.js", import.meta.url), "utf8");
const grab = (src, start) => {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `missing ${start}`);
  let depth = 0, j = src.indexOf(") {", i) + 2;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) break;
  }
  return src.slice(i, j + 1);
};

// --- fake chrome ---
const session = {};
const tabs = { 1: { id: 1, url: "https://www.youtube.com/watch?v=abc&t=10" }, 2: { id: 2, url: "https://www.twitch.tv/caseoh_" } };
globalThis.chrome = {
  storage: { session: {
    get: async (k) => ({ [k]: session[k] }),
    set: async (o) => Object.assign(session, structuredClone(o))
  } },
  tabs: { get: async (id) => tabs[id] }
};

// background
const bgMod = new Function(`${grab(bg, "function pageKey(")}\n${grab(bg, "function mergeTabItems(")}\n${grab(bg, "async function saveTabScan(")}\nreturn { saveTabScan, pageKey };`)();

// panel: real pageKey/showTabScan/clearScanState-reset + render guard prologue
let rendered = [];
const renderSrc = grab(sp, "function renderScanResults(");
const guard = renderSrc.slice(0, renderSrc.indexOf("state.scan = data;"));
const panel = new Function("rendered", `
  let lastRenderedScanId = null; let liveSessionFeed; const tabUrls = {};
  ${guard} rendered.push(data); }
  function showEmptyScanView() { lastRenderedScanId = null; rendered.push("EMPTY"); }
  ${grab(sp, "function pageKey(")}
  ${grab(sp, "async function showTabScan(")}
  return { showTabScan, renderScanResults, pageKey };`)(rendered);

const item = (t) => ({ title: t });
const frame = { mode: "frame", scanId: 1, items: { exactMatches: [item("bracelet")], lookAlikes: [item("x")] } };
const crop = { mode: "crop", scanId: 2, items: { exactMatches: [item("ring")], lookAlikes: [] } };

// keys agree between save and restore, and include YouTube v=
assert.equal(bgMod.pageKey(tabs[1].url), panel.pageKey(tabs[1].url));
assert.equal(panel.pageKey(tabs[1].url), "https://www.youtube.com/watch?v=abc");

await bgMod.saveTabScan(tabs[1], frame);
panel.renderScanResults(frame, true);
await bgMod.saveTabScan(tabs[1], crop);
panel.renderScanResults(crop, true);       // live render of the crop
assert.deepEqual(session.scanByTab[1].payload.items.exactMatches.map((i) => i.title), ["ring"], "crop replaces saved entry");

rendered.length = 0;
await panel.showTabScan(2);                // Twitch: nothing saved
await panel.showTabScan(1);                // back to YouTube
assert.equal(rendered[0], "EMPTY");
assert.equal(rendered[1]?.scanId, 2, "restored snip must render (not swallowed by scanId guard)");
assert.deepEqual(rendered[1].items.exactMatches.map((i) => i.title), ["ring"]);
assert.equal(rendered[1].items.lookAlikes.length, 0, "no old frame results merged back");

// switching back again also restores
rendered.length = 0;
await panel.showTabScan(1);
assert.equal(rendered[0]?.scanId, 2);
console.log("tab-restore: all assertions passed");
