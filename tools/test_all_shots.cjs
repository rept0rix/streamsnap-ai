const fs = require("fs");
const path = require("path");
const { chromium } = require("/Users/naoryanko/rime-rush/node_modules/playwright-core");

const ROOT = "/Users/naoryanko/Documents/antigravity/excited-hopper";
const SCREENSHOT_HTML = path.join(ROOT, "landing_page", "render_appstore_screenshots.html");

async function testAllShots() {
  console.log("Launching headless Chromium...");
  const browser = await chromium.launch({ headless: true });
  const shotContext = await browser.newContext({
    viewport: { width: 1290, height: 2796 },
    deviceScaleFactor: 1
  });
  const page = await shotContext.newPage();
  await page.goto(`file://${SCREENSHOT_HTML}`, { waitUntil: "networkidle" });

  for (let mode = 1; mode <= 4; mode++) {
    await page.evaluate((m) => window.setScreenshotMode(m), mode);
    await page.waitForTimeout(300);
    const outPath = path.join(ROOT, "dist", `test_shot_${mode}_1290x2796.png`);
    await page.screenshot({ path: outPath, type: "png" });
    console.log(`Rendered shot ${mode}: ${outPath}`);
  }

  await browser.close();
}

testAllShots().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
