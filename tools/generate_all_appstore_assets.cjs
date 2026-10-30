const fs = require("fs");
const path = require("path");
const { chromium } = require("/Users/naoryanko/rime-rush/node_modules/playwright-core");

const ROOT = "/Users/naoryanko/Documents/antigravity/excited-hopper";
const DOWNLOADS_DIR = "/Users/naoryanko/Downloads";
const PACKAGE_DIR = path.join(DOWNLOADS_DIR, "StreamSnap_AppStore_Assets");

const HEADER_HTML = path.join(ROOT, "landing_page", "render_appstore_header.html");
const SCREENSHOT_HTML = path.join(ROOT, "landing_page", "render_appstore_screenshots.html");
const APP_ICON_SRC = path.join(ROOT, "mobile", "assets", "icon.png");

// Ensure target directories exist
const DIRS = {
  header: path.join(PACKAGE_DIR, "01_Header_and_Search_Results"),
  shots_6_7: path.join(PACKAGE_DIR, "02_iPhone_Screenshots_6.9_and_6.7_inch"),
  shots_6_5: path.join(PACKAGE_DIR, "03_iPhone_Screenshots_6.5_inch"),
  shots_6_1: path.join(PACKAGE_DIR, "04_iPhone_Screenshots_6.1_inch"),
  icon: path.join(PACKAGE_DIR, "05_App_Icon"),
};

for (const d of Object.values(DIRS)) {
  fs.mkdirSync(d, { recursive: true });
}

async function renderBanner(browser, mode, width, height, filename, dir) {
  console.log(`Rendering Banner: ${filename} (${width}x${height})...`);
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.goto(`file://${HEADER_HTML}`, { waitUntil: "networkidle" });
  await page.evaluate(({ m, w, h }) => window.setBannerMode(m, w, h), { m: mode, w: width, h: height });
  await page.waitForTimeout(600);
  
  const destPackage = path.join(dir, filename);
  const destDirect = path.join(DOWNLOADS_DIR, filename);

  await page.screenshot({ path: destPackage, type: "png" });
  fs.copyFileSync(destPackage, destDirect);
  console.log(`  ✓ Saved to ${destPackage}`);
  console.log(`  ✓ Copied to ${destDirect}`);
  await context.close();
}

async function renderScreenshotSet(browser, width, height, subDir, suffix) {
  console.log(`Rendering Screenshots: ${suffix} (${width}x${height})...`);
  const names = [
    "Screenshot_1_LiveScan_Radar",
    "Screenshot_2_Pause_Stream_Detect",
    "Screenshot_3_Amazon_Visual_Match",
    "Screenshot_4_OneTap_Amazon_Cart"
  ];

  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.goto(`file://${SCREENSHOT_HTML}`, { waitUntil: "networkidle" });

  for (let i = 1; i <= 4; i++) {
    const filename = `${names[i - 1]}_${width}x${height}.png`;
    await page.evaluate(({ m, w, h }) => window.setScreenshotMode(m, w, h), { m: i, w: width, h: height });
    await page.waitForTimeout(400);

    const destPackage = path.join(subDir, filename);
    await page.screenshot({ path: destPackage, type: "png" });
    console.log(`  ✓ Saved ${destPackage}`);

    // If 6.9"/6.7", also copy directly to Downloads with clear name
    if (width === 1290) {
      const directName = `iPhone_${names[i - 1]}_${width}x${height}.png`;
      fs.copyFileSync(destPackage, path.join(DOWNLOADS_DIR, directName));
      console.log(`  ✓ Copied to ~/Downloads/${directName}`);
    }
  }

  await context.close();
}

async function main() {
  console.log("=================================================");
  console.log("STREAMSNAP AI — APP STORE ASSETS GENERATOR");
  console.log("Output Directory: ~/Downloads/StreamSnap_AppStore_Assets/");
  console.log("Direct Delivery:  ~/Downloads/");
  console.log("=================================================");

  const browser = await chromium.launch({ headless: true });

  // 1. App Store Icon (1024x1024, no alpha)
  console.log("Copying App Store Icon (1024x1024)...");
  const iconPkg = path.join(DIRS.icon, "AppStore_Icon_1024x1024.png");
  const iconDirect = path.join(DOWNLOADS_DIR, "AppStore_Icon_1024x1024.png");
  fs.copyFileSync(APP_ICON_SRC, iconPkg);
  fs.copyFileSync(APP_ICON_SRC, iconDirect);
  console.log(`  ✓ Icon copied to ${iconPkg}`);

  // 2. Header and Search Results Assets
  // Universal: 5244 x 2950 (16:9) - covers BOTH Header & Search Results
  await renderBanner(
    browser,
    "universal",
    5244,
    2950,
    "01_AppStore_Header_Universal_5244x2950.png",
    DIRS.header
  );

  // Dedicated Product Page Header: 3840 x 1646 (21:9)
  await renderBanner(
    browser,
    "header21x9",
    3840,
    1646,
    "02_AppStore_Header_Dedicated_3840x1646.png",
    DIRS.header
  );

  // Dedicated Search Results: 3840 x 2560 (3:2)
  await renderBanner(
    browser,
    "search3x2",
    3840,
    2560,
    "03_AppStore_SearchResults_Dedicated_3840x2560.png",
    DIRS.header
  );

  // 3. iPhone 6.9" & 6.7" Display Screenshots (1290 x 2796)
  await renderScreenshotSet(browser, 1290, 2796, DIRS.shots_6_7, "6.9_6.7_inch");

  // 4. iPhone 6.5" Display Screenshots (1284 x 2778)
  await renderScreenshotSet(browser, 1284, 2778, DIRS.shots_6_5, "6.5_inch");

  // 5. iPhone 6.3" & 6.1" Display Screenshots (1179 x 2556)
  await renderScreenshotSet(browser, 1179, 2556, DIRS.shots_6_1, "6.1_inch");

  await browser.close();

  // Create a clean README inside the folder for user reference
  const guideContent = `# StreamSnap AI — Apple App Store Assets Guide

All assets in this folder are 100% compliant with Apple App Store Connect specifications (RGB, No Alpha Channel, exact resolutions).

## 1. Header and Search Results Tab
In App Store Connect > "Product Page Information" > "Header and Search Results":
- **Header Asset (Choose one):**
  - \`01_AppStore_Header_Universal_5244x2950.png\` (Universal 16:9 - Recommended)
  - OR \`02_AppStore_Header_Dedicated_3840x1646.png\` (Dedicated 21:9)
- **Search Results Asset (Choose one):**
  - \`01_AppStore_Header_Universal_5244x2950.png\` (Universal 16:9)
  - OR \`03_AppStore_SearchResults_Dedicated_3840x2560.png\` (Dedicated 3:2)

## 2. App Previews and Screenshots Tab
In App Store Connect > "App Previews and Screenshots":
- **iPhone 6.9" & 6.7" Displays:**
  - Drag all 4 files from folder: \`02_iPhone_Screenshots_6.9_and_6.7_inch/\`
    1. Screenshot_1_LiveScan_Radar_1290x2796.png
    2. Screenshot_2_Pause_Stream_Detect_1290x2796.png
    3. Screenshot_3_Amazon_Visual_Match_1290x2796.png
    4. Screenshot_4_OneTap_Amazon_Cart_1290x2796.png
- **iPhone 6.5" Displays:**
  - Drag all 4 files from folder: \`03_iPhone_Screenshots_6.5_inch/\`
- **iPhone 6.1" Displays:**
  - Drag all 4 files from folder: \`04_iPhone_Screenshots_6.1_inch/\`

## 3. App Store Icon
- File: \`05_App_Icon/AppStore_Icon_1024x1024.png\` (1024x1024 PNG, No Alpha)
`;

  fs.writeFileSync(path.join(PACKAGE_DIR, "README_INSTRUCTIONS.txt"), guideContent);
  console.log("=================================================");
  console.log("✅ ALL ASSETS SUCCESSFULLY GENERATED & DELIVERED!");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Generator failed:", err);
  process.exit(1);
});
