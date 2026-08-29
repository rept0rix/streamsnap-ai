# 🚀 Chrome Web Store Official Submission Guide for StreamSnap AI

This guide contains everything required to publish **StreamSnap AI** to the **Google Chrome Web Store**.

---

## 📋 1. Store Listing Metadata (Copy-Paste Ready)

### Extension Name:
`StreamSnap AI — Live Stream Visual Shopping`

### Short Description (Max 132 chars):
`Shazam for Live Streams: Instant visual product detection and 1-Click Amazon Cart for YouTube, Twitch, TikTok & Facebook Live.`

### Detailed Description:
```markdown
⚡ StreamSnap AI — Shazam for Live Streams & Shoppable Video

Ever watched a live stream on YouTube, Twitch, or TikTok and wondered: "Where did they get that hoodie? What microphone is that? Where can I buy that item right now?"

StreamSnap AI turns any live stream into an interactive, 1-Click shoppable experience! Powered by multi-modal AI Vision and real-time Amazon commerce integration, StreamSnap AI detects products on screen and finds exact matches and look-alikes with real prices and instant buying links.

✨ KEY FEATURES:
• 🎯 Interactive "Snip & Search on Video": Click and drag a box directly over any object on the video (clothing, mask, mic, gadget, drink) to pinpoint that exact item on Amazon!
• ⚡ 1-Click Live Scan: Scan the entire live stream frame instantly with one click or using keyboard shortcut (Option + S / Alt + S).
• 🛒 1-Click Amazon Cart: Add detected items straight to your Amazon Cart without leaving the stream.
• 🔍 Real Product Discovery: Live integration with Amazon catalog providing real photos, current prices, and Prime eligibility.
• 📊 3-Tier Match Engine:
   - Tier 1: 100% Exact verified gear (Microphones, Headphones, Lighting, Tech setups).
   - Tier 2: Visual look-alikes (Fashion, streetwear, decor, and budget alternatives).
   - Tier 3: Inquire & request unidentified streamer items with one click.
• 🌐 Universal Live Platform Support: Works seamlessly on YouTube Live, Twitch, TikTok Live, Facebook Live, and Kick.

🔒 PRIVACY & SECURITY:
• Frame scanning only executes when you explicitly click Scan or Snip.
• All data and settings are stored locally on your device.
• No browsing history tracking or selling of personal data.

Elevate your live stream watching experience today with StreamSnap AI!
```

### Category:
* **Primary Category:** `Shopping` (or `Productivity`)

### Language:
* `English (United States)`

---

## 🛡️ 2. Privacy Practices & Justifications (Required by Google Reviewers)

### Single Purpose Description:
`StreamSnap AI visually detects commercial products and streaming gear visible in video streams and provides direct Amazon shopping links and 1-click cart integration.`

### Permission Justifications for Google Reviewers:
* **`sidePanel`**: Used to present product cards, visual similarity scores, and 1-Click Amazon Cart beside the active video stream without obscuring the video.
* **`activeTab`**: Used to capture the visible video frame only when the user explicitly triggers a product scan or snip.
* **`storage`**: Used to save the user's shopping cart, scan history, and optional API key locally in Chrome storage.
* **`scripting`**: Used to inject the interactive Snip overlay and floating scan buttons onto video elements on supported platforms.
* **`host_permissions`** (`*://*.youtube.com/*`, `*://*.twitch.tv/*`, `*://*.tiktok.com/*`): Required to attach video recognition controls and allow live product discovery on streaming platforms.

### Data Usage Declarations:
* [x] **Does your extension collect user data?** No, frames are processed locally and discarded.
* [x] **Do you sell user data to third parties?** No.
* [x] **Do you use or transfer user data for purposes unrelated to the extension's core functionality?** No.

---

## 📦 3. Create the Production ZIP Archive

Run the following command in your terminal to generate the clean release package:

```bash
cd /Users/naoryanko/Documents/antigravity/excited-hopper/extension
zip -r ../streamsnap-extension-v1.0.0.zip . -x ".*" -x "__MACOSX" -x "demo/*"
```

The resulting file **`streamsnap-extension-v1.0.0.zip`** is located in the project root directory and is ready for upload!

---

## 🚀 4. Step-by-Step Publishing to Chrome Web Store

1. Go to the **[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)**.
2. Sign in with your Google account (Note: If this is your first time, Google charges a one-time \$5 registration fee).
3. Click the **"+ New Item"** button at the top right.
4. Drag and drop **`streamsnap-extension-v1.0.0.zip`**.
5. Fill in the **Store Listing** fields using the copy-paste text in Section 1 above.
6. Upload the store graphics:
   - **Store Icon:** 128x128 PNG (located at `extension/assets/icons/icon128.png`).
   - **Screenshot:** 1280x800 PNG (showing Kai Cenat stream with SidePanel open).
7. Under **Privacy Tab**:
   - Paste the Privacy Policy URL or paste the content from `docs/PRIVACY_POLICY.md`.
   - Enter the permission justifications from Section 2 above.
8. Click **"Submit for Review"**! 🎉

Google usually reviews and approves new extensions within **24–48 hours**.
