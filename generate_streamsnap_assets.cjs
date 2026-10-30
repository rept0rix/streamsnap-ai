const fs = require("fs");
const path = require("path");
const { chromium } = require("/Users/naoryanko/rime-rush/node_modules/playwright-core");

const OUTPUT_DIR = "/Users/naoryanko/Documents/antigravity/excited-hopper/mobile/store_assets";
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const baseCss = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; }
  body {
    width: 1080px;
    height: 1920px;
    background: radial-gradient(circle at 50% 10%, #1e1346 0%, #100a26 50%, #060412 100%);
    color: #fff;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .bg-glow-cyan {
    position: absolute;
    width: 900px;
    height: 900px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(0, 240, 255, 0.25) 0%, rgba(138, 43, 226, 0.15) 50%, transparent 70%);
    top: -250px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .bg-glow-orange {
    position: absolute;
    width: 700px;
    height: 700px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 153, 0, 0.2) 0%, transparent 65%);
    bottom: 50px;
    right: -150px;
    pointer-events: none;
  }
  .header {
    text-align: center;
    padding: 80px 40px 30px;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 240, 255, 0.12);
    border: 1px solid rgba(0, 240, 255, 0.35);
    backdrop-filter: blur(20px);
    padding: 12px 28px;
    border-radius: 100px;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #00f0ff;
    margin-bottom: 22px;
    box-shadow: 0 8px 30px rgba(0, 240, 255, 0.25);
  }
  .title {
    font-size: 64px;
    font-weight: 900;
    line-height: 1.15;
    background: linear-gradient(135deg, #ffffff 30%, #c4d7ff 70%, #8ca9ff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 16px;
    text-shadow: 0 10px 40px rgba(0, 240, 255, 0.25);
  }
  .subtitle {
    font-size: 28px;
    font-weight: 600;
    color: #a6b5d8;
    max-width: 900px;
    line-height: 1.4;
  }
  
  /* Mockup Frame */
  .phone-mockup {
    width: 860px;
    height: 1350px;
    background: #0d091e;
    border-radius: 64px 64px 0 0;
    border: 10px solid #281d52;
    border-bottom: none;
    box-shadow: 0 -25px 90px rgba(0, 0, 0, 0.9), 0 0 70px rgba(0, 240, 255, 0.3);
    position: relative;
    overflow: hidden;
    margin-top: 20px;
    display: flex;
    flex-direction: column;
  }
  .dynamic-island {
    width: 220px;
    height: 42px;
    background: #000;
    border-radius: 24px;
    margin: 18px auto 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 20px;
  }
  .camera-dot {
    width: 14px;
    height: 14px;
    background: #00f0ff;
    border: 3px solid #005a70;
    border-radius: 50%;
    box-shadow: 0 0 10px #00f0ff;
  }
  .phone-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px 32px 0;
    position: relative;
    overflow: hidden;
  }
`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1
  });

  // Base64 encode the streamer image for embedding
  const streamerImgPath = "/Users/naoryanko/Documents/antigravity/excited-hopper/landing_page/assets/ishowspeed_live.png";
  const streamerImgBase64 = fs.existsSync(streamerImgPath)
    ? `data:image/png;base64,${fs.readFileSync(streamerImgPath).toString("base64")}`
    : "";

  // ==========================================
  // 1. StreamSnap Shot 1: Shazam for Live Streams
  // ==========================================
  console.log("Generating StreamSnap Shot 1...");
  let page = await context.newPage();
  await page.setContent(`
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      ${baseCss}
      .stream-card {
        width: 100%;
        height: 520px;
        border-radius: 32px;
        position: relative;
        overflow: hidden;
        border: 2px solid rgba(0, 240, 255, 0.3);
        box-shadow: 0 15px 40px rgba(0,0,0,0.6);
        background: #110d29;
      }
      .stream-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .scan-target {
        position: absolute;
        top: 25%;
        left: 32%;
        width: 220px;
        height: 240px;
        border: 2px dashed #00f0ff;
        border-radius: 16px;
        background: rgba(0, 240, 255, 0.1);
        box-shadow: 0 0 25px rgba(0, 240, 255, 0.5);
      }
      .target-badge {
        position: absolute;
        top: -16px;
        left: 12px;
        background: #00f0ff;
        color: #000;
        font-size: 14px;
        font-weight: 900;
        padding: 4px 12px;
        border-radius: 100px;
        box-shadow: 0 4px 12px rgba(0, 240, 255, 0.6);
      }
      .live-indicator {
        position: absolute;
        top: 18px;
        left: 18px;
        background: rgba(255, 0, 50, 0.85);
        color: white;
        font-size: 14px;
        font-weight: 800;
        padding: 6px 16px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .product-popup {
        margin-top: 24px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(0, 240, 255, 0.35);
        border-radius: 32px;
        padding: 24px 28px;
        backdrop-filter: blur(25px);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      }
      .match-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
      }
      .match-percent {
        background: linear-gradient(135deg, #00f0ff, #0072ff);
        color: #000;
        font-weight: 900;
        font-size: 15px;
        padding: 4px 14px;
        border-radius: 30px;
      }
      .product-title {
        font-size: 24px;
        font-weight: 800;
        color: #fff;
        margin-bottom: 8px;
      }
      .price-row {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 28px;
        font-weight: 900;
        color: #ff9900;
        margin-bottom: 20px;
      }
      .prime-tag {
        background: #00a8e1;
        color: white;
        font-size: 14px;
        font-weight: 800;
        font-style: italic;
        padding: 4px 10px;
        border-radius: 6px;
      }
      .buy-button {
        width: 100%;
        background: linear-gradient(135deg, #ff9900, #ff5500);
        color: #000;
        font-weight: 900;
        font-size: 22px;
        padding: 20px;
        border-radius: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        box-shadow: 0 12px 35px rgba(255, 153, 0, 0.4);
      }
    </style>
  </head>
  <body>
    <div class="bg-glow-cyan"></div>
    <div class="bg-glow-orange"></div>
    <div class="header">
      <div class="badge">⚡ Real-Time AI Visual Commerce</div>
      <h1 class="title">Shazam for Live Streams</h1>
      <p class="subtitle">Identify clothes, gear &amp; products worn by streamers in 1 tap</p>
    </div>
    
    <div class="phone-mockup">
      <div class="dynamic-island"><div class="camera-dot"></div></div>
      <div class="phone-content">
        <div class="stream-card">
          <img src="${streamerImgBase64}" class="stream-img" />
          <div class="live-indicator">🔴 LIVE NOW • 124K Watching</div>
          <div class="scan-target">
            <div class="target-badge">⚡ 98% AI Match</div>
          </div>
        </div>

        <div class="product-popup">
          <div class="match-row">
            <span style="font-size: 16px; color: #00f0ff; font-weight: 700;">🎯 AI OBJECT DETECTED</span>
            <span class="match-percent">98% Match</span>
          </div>
          <div class="product-title">AC Milan Red &amp; Black Jersey 2024</div>
          <div class="price-row">
            <span>$49.99</span>
            <span class="prime-tag">prime</span>
            <span style="font-size: 16px; color: #a0a0c0; font-weight: 600;">⭐ 4.8 (8,230 reviews)</span>
          </div>
          <div class="buy-button">
            <span>🛒</span> Add to Amazon Cart
          </div>
        </div>
      </div>
    </div>
  </body>
  </html>
  `);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "streamsnap_shot1_1080x1920.png") });
  await page.close();

  // ==========================================
  // 2. StreamSnap Shot 2: Verified Amazon Products
  // ==========================================
  console.log("Generating StreamSnap Shot 2...");
  page = await context.newPage();
  await page.setContent(`
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      ${baseCss}
      .product-item {
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 28px;
        padding: 22px;
        margin-bottom: 20px;
        display: flex;
        gap: 20px;
        align-items: center;
      }
      .product-thumb {
        width: 120px;
        height: 120px;
        border-radius: 20px;
        background: #181238;
        border: 1px solid rgba(0, 240, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 56px;
      }
      .product-details {
        flex: 1;
      }
      .product-name {
        font-size: 20px;
        font-weight: 800;
        margin-bottom: 6px;
      }
      .product-price {
        font-size: 24px;
        font-weight: 900;
        color: #ff9900;
        display: flex;
        align-items: center;
        gap: 10px;
      }
    </style>
  </head>
  <body>
    <div class="bg-glow-cyan"></div>
    <div class="bg-glow-orange"></div>
    <div class="header">
      <div class="badge">🛒 Verified Amazon Catalog</div>
      <h1 class="title">1-Click Amazon Cart</h1>
      <p class="subtitle">Real prices, authentic reviews &amp; next-day Prime delivery</p>
    </div>
    
    <div class="phone-mockup">
      <div class="dynamic-island"><div class="camera-dot"></div></div>
      <div class="phone-content" style="padding-top: 30px;">
        <div style="font-size: 24px; font-weight: 800; margin-bottom: 20px; color: #00f0ff;">Detected in This Stream:</div>

        <div class="product-item" style="border-color: rgba(0, 240, 255, 0.4); background: rgba(0, 240, 255, 0.08);">
          <div class="product-thumb">👕</div>
          <div class="product-details">
            <div style="font-size: 13px; color: #00f0ff; font-weight: 800;">TIER 1 MATCH • 98%</div>
            <div class="product-name">Puma AC Milan Home Jersey 2024</div>
            <div class="product-price">
              <span>$49.99</span>
              <span style="font-size: 13px; background: #00a8e1; color: #fff; padding: 2px 8px; border-radius: 4px;">prime</span>
            </div>
            <div style="font-size: 14px; color: #4cd964; margin-top: 4px;">In Stock • Ships Tomorrow</div>
          </div>
        </div>

        <div class="product-item">
          <div class="product-thumb">🧢</div>
          <div class="product-details">
            <div style="font-size: 13px; color: #ffca28; font-weight: 800;">VISUAL MATCH • 94%</div>
            <div class="product-name">New Era LA Dodgers Fitted Cap</div>
            <div class="product-price">
              <span>$34.99</span>
              <span style="font-size: 13px; background: #00a8e1; color: #fff; padding: 2px 8px; border-radius: 4px;">prime</span>
            </div>
            <div style="font-size: 14px; color: #4cd964; margin-top: 4px;">In Stock • 4.9 ⭐ (15k)</div>
          </div>
        </div>

        <div class="product-item">
          <div class="product-thumb">👟</div>
          <div class="product-details">
            <div style="font-size: 13px; color: #ffca28; font-weight: 800;">VISUAL MATCH • 91%</div>
            <div class="product-name">Nike Air Force 1 '07 Triple White</div>
            <div class="product-price">
              <span>$115.00</span>
              <span style="font-size: 13px; background: #00a8e1; color: #fff; padding: 2px 8px; border-radius: 4px;">prime</span>
            </div>
            <div style="font-size: 14px; color: #4cd964; margin-top: 4px;">Verified Authenticity</div>
          </div>
        </div>

        <div class="product-item">
          <div class="product-thumb">🎧</div>
          <div class="product-details">
            <div style="font-size: 13px; color: #00f0ff; font-weight: 800;">TIER 1 MATCH • 96%</div>
            <div class="product-name">Sony WH-1000XM5 Wireless Headphones</div>
            <div class="product-price">
              <span>$348.00</span>
              <span style="font-size: 13px; background: #00a8e1; color: #fff; padding: 2px 8px; border-radius: 4px;">prime</span>
            </div>
            <div style="font-size: 14px; color: #4cd964; margin-top: 4px;">Streamer Audio Choice</div>
          </div>
        </div>

        <div style="background: linear-gradient(135deg, #ff9900, #ff5500); padding: 22px; border-radius: 24px; text-align: center; color: black; font-weight: 900; font-size: 22px; box-shadow: 0 12px 35px rgba(255, 153, 0, 0.4); margin-top: 10px;">
          🛒 Proceed to Amazon Checkout (4 Items)
        </div>
      </div>
    </div>
  </body>
  </html>
  `);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "streamsnap_shot2_1080x1920.png") });
  await page.close();

  // ==========================================
  // 3. StreamSnap Shot 3: Multi-Platform Support
  // ==========================================
  console.log("Generating StreamSnap Shot 3...");
  page = await context.newPage();
  await page.setContent(`
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      ${baseCss}
      .platform-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
        margin-top: 20px;
      }
      .platform-card {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 28px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .platform-icon {
        font-size: 50px;
        margin-bottom: 12px;
      }
      .platform-name {
        font-size: 20px;
        font-weight: 800;
        margin-bottom: 4px;
      }
      .platform-stat {
        font-size: 14px;
        color: #00f0ff;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div class="bg-glow-cyan"></div>
    <div class="bg-glow-orange"></div>
    <div class="header">
      <div class="badge">🌐 Universal Platform Support</div>
      <h1 class="title">YouTube, Twitch &amp; TikTok</h1>
      <p class="subtitle">Works seamlessly on any live stream and video across top creators</p>
    </div>
    
    <div class="phone-mockup">
      <div class="dynamic-island"><div class="camera-dot"></div></div>
      <div class="phone-content" style="padding-top: 24px;">
        <div style="font-size: 24px; font-weight: 800; margin-bottom: 10px; color: #fff;">Connected Platforms</div>
        
        <div class="platform-grid">
          <div class="platform-card" style="border-color: rgba(255, 0, 0, 0.35); background: rgba(255, 0, 0, 0.08);">
            <div class="platform-icon">▶️</div>
            <div class="platform-name">YouTube Live</div>
            <div class="platform-stat">Real-time Stream Sync</div>
          </div>

          <div class="platform-card" style="border-color: rgba(145, 70, 255, 0.35); background: rgba(145, 70, 255, 0.08);">
            <div class="platform-icon">👾</div>
            <div class="platform-name">Twitch</div>
            <div class="platform-stat">Instant Chat &amp; Clips</div>
          </div>

          <div class="platform-card" style="border-color: rgba(0, 240, 255, 0.35); background: rgba(0, 240, 255, 0.08);">
            <div class="platform-icon">🎵</div>
            <div class="platform-name">TikTok Live</div>
            <div class="platform-stat">Trend &amp; OOTD Scanner</div>
          </div>

          <div class="platform-card" style="border-color: rgba(255, 153, 0, 0.35); background: rgba(255, 153, 0, 0.08);">
            <div class="platform-icon">⚡</div>
            <div class="platform-name">AWS Bedrock</div>
            <div class="platform-stat">Titan Multimodal AI</div>
          </div>
        </div>

        <div style="margin-top: 24px; background: rgba(0, 240, 255, 0.1); border: 1px solid #00f0ff; border-radius: 28px; padding: 20px; text-align: center;">
          <div style="font-size: 20px; font-weight: 800; color: #00f0ff; margin-bottom: 4px;">🚀 100,000+ Products Scanned Live</div>
          <p style="font-size: 15px; color: #c4d7ff;">Never wonder where a streamer bought their outfit again.</p>
        </div>

        <div style="font-size: 22px; font-weight: 800; margin: 24px 0 14px; color: #fff;">Trending Live Streams Now</div>

        <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; padding: 18px 20px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <span style="font-size: 32px;">🔥</span>
            <div>
              <div style="font-size: 18px; font-weight: 800;">Kai Cenat • 24H Marathon</div>
              <div style="font-size: 13px; color: #00f0ff; font-weight: 700;">8 items detected in stream</div>
            </div>
          </div>
          <span style="font-size: 14px; color: #4cd964; font-weight: 800; background: rgba(76,217,100,0.15); padding: 6px 14px; border-radius: 20px;">● Scanning</span>
        </div>

        <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; padding: 18px 20px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <span style="font-size: 32px;">⚡</span>
            <div>
              <div style="font-size: 18px; font-weight: 800;">IShowSpeed • Miami Live</div>
              <div style="font-size: 13px; color: #00f0ff; font-weight: 700;">4 items detected in stream</div>
            </div>
          </div>
          <span style="font-size: 14px; color: #4cd964; font-weight: 800; background: rgba(76,217,100,0.15); padding: 6px 14px; border-radius: 20px;">● Scanning</span>
        </div>
      </div>
    </div>
  </body>
  </html>
  `);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "streamsnap_shot3_1080x1920.png") });
  await page.close();

  // ==========================================
  // 4. StreamSnap Feature Graphic (1024x500)
  // ==========================================
  console.log("Generating StreamSnap Feature Graphic (1024x500)...");
  const featureContext = await browser.newContext({
    viewport: { width: 1024, height: 500 },
    deviceScaleFactor: 1
  });
  page = await featureContext.newPage();
  await page.setContent(`
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
      body {
        width: 1024px;
        height: 500px;
        background: radial-gradient(circle at 70% 40%, #1c1545 0%, #0d0926 50%, #050312 100%);
        color: white;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 60px;
        overflow: hidden;
        position: relative;
      }
      .glow-banner {
        position: absolute;
        width: 700px;
        height: 700px;
        background: radial-gradient(circle, rgba(0, 240, 255, 0.3) 0%, transparent 65%);
        right: 20px;
        top: -100px;
        pointer-events: none;
      }
      .left-content {
        max-width: 540px;
        z-index: 2;
      }
      .brand-title {
        font-size: 48px;
        font-weight: 900;
        letter-spacing: -0.5px;
        background: linear-gradient(135deg, #ffffff 40%, #00f0ff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 8px;
      }
      .tagline {
        font-size: 24px;
        font-weight: 700;
        color: #ff9900;
        margin-bottom: 12px;
      }
      .subtagline {
        font-size: 18px;
        font-weight: 500;
        color: #a6b5d8;
        line-height: 1.4;
        margin-bottom: 24px;
      }
      .feature-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .pill {
        background: rgba(0, 240, 255, 0.1);
        border: 1px solid rgba(0, 240, 255, 0.3);
        padding: 8px 18px;
        border-radius: 40px;
        font-size: 14px;
        font-weight: 700;
        color: #00f0ff;
      }
      .right-mockup {
        position: relative;
        z-index: 2;
        width: 360px;
        height: 480px;
        background: #100b2e;
        border-radius: 40px;
        border: 8px solid #281d52;
        box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 50px rgba(0,240,255,0.4);
        transform: rotate(4deg) translateY(20px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <div class="glow-banner"></div>
    <div class="left-content">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
        <span style="background: #00f0ff; color: #000; font-weight: 900; padding: 4px 12px; border-radius: 8px; font-size: 14px;">AI COMMERCE</span>
        <span style="background: #ff9900; color: #000; font-weight: 900; padding: 4px 12px; border-radius: 8px; font-size: 14px;">PRIME READY</span>
      </div>
      <div class="brand-title">StreamSnap AI</div>
      <div class="tagline">Shazam for Live Streams</div>
      <div class="subtagline">Real-time AI object &amp; fashion recognition on YouTube, Twitch &amp; TikTok. 1-click buy on Amazon.</div>
      <div class="feature-pills">
        <div class="pill">⚡ 98% AI Match</div>
        <div class="pill">🛒 1-Click Cart</div>
        <div class="pill">📹 Live Video Sync</div>
        <div class="pill">📦 Prime Delivery</div>
      </div>
    </div>

    <div class="right-mockup">
      <img src="${streamerImgBase64}" style="width: 100%; height: 260px; object-fit: cover;" />
      <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="font-size: 12px; color: #00f0ff; font-weight: 800;">⚡ DETECTED ITEM</div>
          <div style="font-size: 18px; font-weight: 800; color: #fff;">AC Milan 2024 Jersey</div>
          <div style="font-size: 20px; font-weight: 900; color: #ff9900; margin-top: 4px;">$49.99 <span style="font-size: 12px; background: #00a8e1; color: white; padding: 2px 6px; border-radius: 4px;">prime</span></div>
        </div>
        <div style="background: linear-gradient(135deg, #ff9900, #ff5500); padding: 12px; border-radius: 14px; text-align: center; color: black; font-weight: 900; font-size: 16px;">
          🛒 Add to Amazon
        </div>
      </div>
    </div>
  </body>
  </html>
  `);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "streamsnap_feature_1024x500.png") });
  await page.close();
  await featureContext.close();

  // ==========================================
  // 5. StreamSnap 512x512 App Icon
  // ==========================================
  console.log("Generating StreamSnap 512x512 App Icon...");
  const iconContext = await browser.newContext({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 1
  });
  page = await iconContext.newPage();
  await page.setContent(`
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 512px;
        height: 512px;
        background: radial-gradient(circle at 30% 30%, #251b5c 0%, #100b2e 60%, #060417 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }
      .ring {
        position: absolute;
        width: 380px;
        height: 380px;
        border-radius: 50%;
        border: 4px dashed rgba(0, 240, 255, 0.4);
      }
      .inner-circle {
        width: 300px;
        height: 300px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00f0ff 0%, #7928ca 50%, #ff0080 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 20px 60px rgba(0, 240, 255, 0.5), inset 0 2px 15px rgba(255,255,255,0.6);
      }
      .bolt {
        font-size: 150px;
        filter: drop-shadow(0 10px 20px rgba(0,0,0,0.4));
      }
    </style>
  </head>
  <body>
    <div class="ring"></div>
    <div class="inner-circle">
      <div class="bolt">⚡</div>
    </div>
  </body>
  </html>
  `);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "streamsnap_icon_512.png") });
  await page.close();
  await iconContext.close();

  await browser.close();
  console.log("StreamSnap assets generated successfully!");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
