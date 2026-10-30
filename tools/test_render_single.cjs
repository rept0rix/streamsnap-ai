const fs = require("fs");
const path = require("path");
const { chromium } = require("/Users/naoryanko/rime-rush/node_modules/playwright-core");

const ROOT = "/Users/naoryanko/Documents/antigravity/excited-hopper";
const HEADER_HTML = path.join(ROOT, "landing_page", "render_appstore_header.html");
const SCREENSHOT_HTML = path.join(ROOT, "landing_page", "render_appstore_screenshots.html");

async function testRender() {
  console.log("Launching headless Chromium...");
  const browser = await chromium.launch({ headless: true });
  
  // Test 1: Header 5244x2950
  console.log("Rendering Header 5244x2950...");
  const headerContext = await browser.newContext({
    viewport: { width: 5244, height: 2950 },
    deviceScaleFactor: 1
  });
  const headerPage = await headerContext.newPage();
  await headerPage.goto(`file://${HEADER_HTML}`, { waitUntil: "networkidle" });
  await headerPage.evaluate(() => window.setBannerMode('universal', 5244, 2950));
  await headerPage.waitForTimeout(500);
  const headerPath = path.join(ROOT, "dist", "test_header_5244x2950.png");
  await headerPage.screenshot({ path: headerPath, type: "png" });
  console.log("Header rendered:", headerPath);
  await headerContext.close();

  // Test 2: Screenshot 1 (1290x2796)
  console.log("Rendering Screenshot 1 (1290x2796)...");
  const shotContext = await browser.newContext({
    viewport: { width: 1290, height: 2796 },
    deviceScaleFactor: 1
  });
  const shotPage = await shotContext.newPage();
  await shotPage.goto(`file://${SCREENSHOT_HTML}`, { waitUntil: "networkidle" });
  await shotPage.evaluate(() => window.setScreenshotMode(1));
  await shotPage.waitForTimeout(500);
  const shotPath = path.join(ROOT, "dist", "test_screenshot_1_1290x2796.png");
  await shotPage.screenshot({ path: shotPath, type: "png" });
  console.log("Screenshot 1 rendered:", shotPath);
  await shotContext.close();

  await browser.close();
}

testRender().catch((err) => {
  console.error("Test render failed:", err);
  process.exit(1);
});
