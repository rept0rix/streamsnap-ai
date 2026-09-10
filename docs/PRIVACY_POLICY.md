# Privacy Policy for StreamSnap AI

**Last updated:** September 10, 2026

StreamSnap AI ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how the StreamSnap AI **Chrome extension**, **iOS app**, and **Android app** collect, use, and safeguard information.

**Website:** https://streamsnap.online  
**Contact:** naor@streamsnap.online

This is the policy URL for Google Play and the App Store: `https://streamsnap.online/privacy.html`.

---

## 1. Products this policy covers

* **Chrome extension** — visual product detection on YouTube, Twitch, TikTok, Facebook Live, and Kick.
* **iOS app** — camera, gallery, and Live Scan via ReplayKit Broadcast Upload (you start the system broadcast picker).
* **Android app** — camera, gallery, and Live Scan via Android MediaProjection (you approve the system screen-capture prompt). A foreground notification stays visible while capture is running; you can stop from the in-app STOP control, the notification, or the floating STOP pill.

StreamSnap does **not** record audio. Live Scan does **not** run until you explicitly start it.

---

## 2. Information we process

### Video frames and screen capture (Live Scan)

When you start a scan — Scan / Snip in the extension, camera/gallery in the app, or **Live Scan** on iOS/Android — StreamSnap captures a still frame (or a cropped region) for visual product recognition.

* **Purpose:** Identify shoppable items (fashion, audio gear, accessories) and return Amazon / catalog matches.
* **Who initiates it:** You. The extension scans when you click Scan or Snip. The mobile apps capture the screen only after you tap Live Scan and accept the OS permission dialog (ReplayKit on iOS, MediaProjection on Android).
* **Storage:** Frames are sent to our Cloudflare Worker for recognition, then discarded from our servers after processing. Downscaled thumbnails of finds may be stored **on your device** (Chrome storage or the app’s local store) so the catalog can show “what the camera saw” next to the Amazon image. We do **not** keep a server-side archive of your video, browsing history, or other apps on screen.
* **Retention on device:** Catalog history is capped (about 200 items in the extension; similar local limits in the app). You can clear it in the product.
* **Android / iOS Live Scan:** Capture continues only while the OS session is active. Locking the phone, tapping the system screen-share chip, or tapping STOP ends capture. We do not capture when Live Scan is off.

### Camera

If you use in-app camera scan, the camera image is used only for that scan, the same way as a Live Scan frame. We do not run the camera in the background.

### Photo library / gallery

If you pick a screenshot or photo, that image is used only to identify products. We do not scan your library in the background.

### Google Sign-In

If you sign in with Google, we store your name, email, and profile picture to attach your account, scan quota, and synced history. You can use the products without signing in, subject to a smaller anonymous allowance.

### Install identifiers and quota

The apps and extension send a locally generated install ID with each `/resolve` request so we can enforce fair-use rate limits. This is not an advertising ID. We do not sell it.

### Notifications

On Android 13+ and iOS, we ask for notification permission so Live Scan can alert you when a product is found and so the Android foreground “Live Scan is running” notice can appear. You can deny notifications; capture may still run, but you will not get find alerts.

### Preferences and optional API keys

A Gemini API key you paste in settings is stored on the device and sent only to Google’s Generative AI API when you scan. We do not use it for advertising.

---

## 3. How we use information

We use the information above only to:

* Recognize products in the frame you chose and return shopping matches
* Maintain your on-device catalog, cart, and optional cloud history when signed in
* Enforce scan quotas and prevent abuse
* Provide account sign-in

We do **not** sell, rent, or trade personal data. StreamSnap contains no ad SDKs and no third-party analytics telemetry.

---

## 4. Third-party services

* **Cloudflare Worker / R2 / KV** (`streamsnap-lens.na0ryank0.workers.dev`) — receives the scan image, runs vision, caches **product results** (not the raw video), and hosts the API.
* **Google Gemini / Google Cloud Vision** (when configured) — image bytes are sent for visual analysis under Google’s terms.
* **Google Sign-In** — authentication only.
* **Amazon** — when you tap a product we open Amazon with an Associates tag. We do not read your Amazon account, payment details, or purchase history.

### Affiliate disclosure

StreamSnap AI links to Amazon using an Amazon Associates tag and may earn a commission on qualifying purchases at no extra cost to you. In-app “projected” earnings are estimates, not reported revenue.

---

## 5. Permissions (why we ask)

**Chrome extension**

* `sidePanel` — product cards and cart beside the stream
* `activeTab` — capture the visible video frame when you scan
* `storage` — cart, history, optional API key on the device
* Host access limited to youtube.com, twitch.tv, tiktok.com, facebook.com, and kick.com

**iOS**

* Camera — optional camera scan
* Photo library — optional screenshot scan
* Broadcast / ReplayKit — Live Scan of the screen **after you start the system broadcast**
* Notifications — optional find alerts
* App Group `group.com.streamsnap.ai` — share Live Scan finds from the broadcast extension to the app

**Android**

* Camera — optional camera scan
* Photos / media — optional gallery scan
* Notifications — Live Scan running notice and find alerts
* Foreground service (`mediaProjection`) — keep Live Scan alive while you switch to TikTok / YouTube; a persistent notification is shown
* Screen capture (MediaProjection) — only after the system capture prompt

---

## 6. Data sharing, sale, and children

We do **not** sell personal data. We do not use or transfer scan frames for advertising. StreamSnap is not directed at children under 13 (or under 16 where a higher age applies). Do not use the product if you are under that age.

---

## 7. Contact

**Email:** naor@streamsnap.online  
**Website:** https://streamsnap.online
