<p align="center">
  <img src="extension/assets/branding/logo_full.svg" alt="StreamSnap AI" width="540" />
</p>

<p align="center">
  <strong>Universal Multi-Modal AI Commerce Engine — "Shazam for Live Streams"</strong><br />
  Turn any live video stream on YouTube, Twitch, TikTok, or Kick into an instant 1-Click Amazon shopping experience.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome_Manifest-V3_Certified-blue?style=for-the-badge&logo=googlechrome" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Vision_AI-Gemini_2.5_Flash-orange?style=for-the-badge&logo=google" alt="Gemini Vision" />
  <img src="https://img.shields.io/badge/Amazon-1--Click_Remote_Cart-FF9900?style=for-the-badge&logo=amazon" alt="Amazon Cart" />
  <img src="https://img.shields.io/badge/Frame_Cache-pHash-10B981?style=for-the-badge" alt="Frame Cache" />
  <img src="https://img.shields.io/badge/License-MIT-purple?style=for-the-badge" alt="License" />
</p>

---

## 📸 StreamSnap AI in Action

<p align="center">
  <img src="docs/assets/screenshots/streamsnap_live_youtube.png" alt="StreamSnap AI running on YouTube Live with Kai Cenat" width="95%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
</p>

> **Live Stream Visual Commerce:** Detect microphones, fashion, electronics, gym equipment, and studio gear directly inside any live stream in under 2 seconds.

---

## ⚡ Key Features

| Feature | Description |
| :--- | :--- |
| **🔴 Click-to-Find Live** | Click ANY item directly on the playing video to drop a pulse ripple and identify it instantly. |
| **🎯 Snip Box on Video** | Click or drag a box over any object to perform high-resolution cropped multi-modal AI vision analysis. |
| **⚡ 1-Click Full Scan** | Laser scan of the entire video frame (`Alt+S` in-page, or `Alt+Shift+S` from anywhere). |
| **🛒 Amazon Cart** | Builds a multi-item Amazon Remote Cart link (`/gp/aws/cart/add.html`) from every verified item you stage. |
| **✓ Verified vs. Visual** | Items matched to a confirmed listing get a direct product link. Everything else is labelled a **visual match** and opens an Amazon search — StreamSnap never invents an ASIN. |
| **📸 Source Frame Trace** | Modal showing the cropped video snapshot beside the matched product. |
| **📦 Deduplicated History** | Saves discovered products across sessions and increments a sighting count (`Seen 3×`). Capped at 200 items with oldest-first eviction so local storage never overflows. |
| **⚡ Frame Cache** | Perceptual hashing skips the Vision API entirely when a frame is visually unchanged, which is most of the time on a static stream. |

---

## 📥 Installation Guide (Step-by-Step)

### Option A: Install from Local Source (Developer Mode)

#### Step 1: Clone or Download the Repository
```bash
git clone https://github.com/rept0rix/streamsnap-ai.git
cd streamsnap-ai
```

#### Step 2: Open Extensions in Google Chrome
1. In Google Chrome, navigate to `chrome://extensions/`.
2. Toggle the **"Developer mode"** switch in the top-right corner.

<p align="center">
  <img src="docs/assets/screenshots/streamsnap_sidepanel_full.png" alt="StreamSnap AI Sidepanel UI" width="600" style="border-radius: 8px;" />
</p>

#### Step 3: Load Unpacked Extension
1. Click the **"Load unpacked"** button in the top-left corner.
2. Select the `extension/` folder inside the `streamsnap-ai` directory.
3. **StreamSnap AI** will appear in your Chrome toolbar!

#### Step 4: Pin StreamSnap AI to Your Toolbar
1. Click the Puzzle Piece icon in Chrome's top bar.
2. Click the Pin icon next to **StreamSnap AI**.

---

## 🎮 How to Use (Usage Guide)

### 1. ⚡ Live Point-and-Click on Video
1. Open any live stream on [YouTube](https://www.youtube.com), [Twitch](https://www.twitch.tv), or [TikTok](https://www.tiktok.com).
2. Click the **`🔴 Click Anything Live`** button located at the top-right of the video player.
3. Click on **any object** (hoodie, microphone, beverage, phone, headphones) on screen.
4. An animated pulse ripple will appear, and the exact Amazon listing will slide into your SidePanel!

### 2. 🎯 Snip Box on Video
1. Click **`🎯 Snip Box`** on the video overlay.
2. Drag a box over any item or simply single-click the item.
3. StreamSnap extracts a high-resolution crop and identifies it. If it maps to a confirmed listing you get a direct product link; otherwise the card is marked **visual match** and links to an Amazon search.

> **Before your first scan:** open the **`⚙️ Setup`** tab and paste a free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey). It is stored only on your device. Without a key, scanning is disabled — StreamSnap will tell you so rather than showing placeholder results.

### 3. 📸 Source Frame Traceability
Want to verify which video moment an item came from?
1. Open the **`📦 Catalog`** tab in the SidePanel.
2. Click **`📸 Frame`** on any product card.
3. A split-screen modal pops up showing the original video crop alongside the Amazon product image:

<p align="center">
  <img src="docs/assets/screenshots/streamsnap_catalog_cards.png" alt="StreamSnap AI Catalog Cards" width="540" style="border-radius: 8px;" />
</p>

---

## 🏗️ Architecture

```text
  [ Live Video Stream (YouTube / Twitch / TikTok / Facebook / Kick) ]
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [ ⚡ Full Frame Scan ]            [ 🎯 User Snip / Click ]
            │                                 │
            └────────────────┬────────────────┘
                             ▼
              [ Perceptual Hash Lookup ]         services/frame_cache.js
                             │
            ┌────────────────┴────────────────┐
     (hamming ≤ 4)                     (new frame)
            ▼                                 ▼
   [ Cached Result — no API call ]   [ Gemini 2.5 Flash Vision ]
            │                                 │
            └────────────────┬────────────────┘
                             ▼
          [ Detection Reconciliation ]          services/amazon_service.js
    · confidence filter    · verified-ASIN check
    · unverified items keep the detection, lose the ASIN
                             │
                             ▼
          [ Quota-Aware Persistence ]           services/storage.js
    · thumbnails downscaled to 200px  · catalog capped at 200
                             │
                             ▼
       [ Side Panel: Live · History · Cart · Stats ]
```

### Project layout

```text
extension/
  background/background.js    MV3 service worker — capture, Gemini, persistence
  content/content.js          In-page overlay controls (debounced, no polling)
  sidepanel/                  Panel UI; all cards built via DOM, never innerHTML
  services/
    amazon_service.js         ASIN verification, cart & affiliate URLs
    frame_cache.js            Perceptual hashing to skip redundant API calls
    storage.js                Downscaling, quota budgeting, safe writes
tools/
  validate.mjs                Manifest, module graph, XSS and permission checks
  test.mjs                    Behavioural tests for the commerce layer
  package.sh                  Validate → test → build the store zip
```

---

## 🧪 Development

```bash
node tools/validate.mjs   # manifest, imports, HTML ids, XSS, permissions
node tools/test.mjs       # commerce layer behaviour (16 assertions)
bash tools/package.sh     # runs both, then builds dist/streamsnap-extension-v<version>.zip
```

`validate.mjs` fails the build on the mistakes that only show up once Chrome
loads the extension: a manifest pointing at a deleted file, an import that no
longer resolves, a `getElementById` for markup that does not exist, `document`
or `setInterval` inside the service worker, template interpolation into
`innerHTML`, a hardcoded API key, or a synthesized ASIN.

---

## 💰 Monetization

- **Amazon Associates:** 1%–10% depending on category, on qualifying purchases made within the cookie window after a click.
- **Creator tag:** Streamers enter their own Associates tag in Setup so links attribute to them.
- **Prime bounty:** Amazon pays a per-signup bounty on qualifying new Prime subscribers.

> The "Projected" number in the Stats tab is calculated from list prices and Amazon's published rate cards. It is an estimate, not reported revenue — actual earnings appear only in your Amazon Associates dashboard.

---

## 📑 Investor & Acquisition Documents

- 📄 **[Amazon M&A Acquisition Pitch Deck](docs/AMAZON_MA_PITCH_DECK.md)** — Strategic rationale on why Amazon needs StreamSnap AI to conquer TikTok Shop.
- 📊 **[3-Year Financial Model & Business Plan](docs/BUSINESS_PLAN_AND_FINANCIAL_MODEL.md)** — Detailed P&L and unit economics scaling to \$73.5M ARR.
- 💼 **[Seed Round Investor Memo ($1.5M)](docs/INVESTOR_MEMO.md)** — Complete VC memorandum and growth milestones.
- 🔒 **[Privacy Policy](docs/PRIVACY_POLICY.md)** — Zero-data-collection, local-first privacy compliance.
- 🛒 **[Chrome Web Store Submission Guide](docs/CHROME_STORE_SUBMISSION.md)** — Official store listing copy and assets.

---

## 🌐 Live Demo & Interactive Simulator

Check out our interactive landing page and stream simulator:
- **Landing Page:** [`landing_page/index.html`](landing_page/index.html)
- **Live Simulator:** Test clicking on mock microphones, headphones, and hoodies without opening a live stream!

---

## 🛡️ License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
