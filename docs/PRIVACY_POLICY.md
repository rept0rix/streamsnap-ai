# Privacy Policy for StreamSnap AI

**Last updated:** August 29, 2026

StreamSnap AI ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how our Chrome extension collects, uses, and safeguards information when you use StreamSnap AI.

---

## 1. Information We Process

### Video Frame Captures
When you explicitly initiate a scan (by clicking "Scan Live Products", "Snip & Search on Video", or using keyboard shortcuts), StreamSnap AI captures a frame or cropped region of the active video stream for real-time visual recognition.

* **Purpose:** Frame data is processed solely to extract visual features and identify visible products (fashion, audio gear, accessories).
* **Storage:** Captured images are processed in memory and stored locally on your device (`chrome.storage.local`). Stored images are downscaled thumbnails (max 200px) plus one downscaled snapshot (max 720px) of your most recent scan. We do NOT store your video frames or browsing history on external servers.
* **Retention:** Your product history is capped at 200 items and is trimmed oldest-first when local storage fills. You can erase all of it at any time with "Clear History" in the History tab.
* **Caching:** Frames are fingerprinted locally so a repeated, visually identical frame reuses the previous result instead of making another API call. Fingerprints live in memory only and are discarded after 15 minutes.

### API Keys and Preferences
Your Gemini API key and visual search preferences are stored locally in your browser via `chrome.storage.local`. They are never transmitted to third parties other than the official Google Gemini API endpoint (`generativelanguage.googleapis.com`) to execute visual queries requested by you.

---

## 2. Third-Party Services

* **Google Gemini API:** When visual analysis is performed, image data is transmitted directly to Google's Generative AI API using your configured API key according to Google's Privacy Policy.
* **Amazon Commerce Services:** When you click through to a product or open the cart, you are directed to Amazon.com with an affiliate referral tag. StreamSnap does not read Amazon pages and does not receive, collect, or store your Amazon account credentials, payment details, or purchase history.

### Affiliate Disclosure
StreamSnap AI links to Amazon using an Amazon Associates tag and may earn a commission on qualifying purchases at no extra cost to you. The "Projected" figure in the Stats tab is an estimate calculated from list prices and Amazon's published rate cards. It is not reported revenue and does not reflect actual earnings, which appear only in your Amazon Associates dashboard.

---

## 3. Permissions Justification

* `sidePanel`: Displays product cards and the staged cart beside the video.
* `activeTab`: Captures the visible video frame when you start a scan.
* `storage`: Saves your cart, product history, API key and preferences locally on your device.
* `alarms`: Runs the optional auto-scan interval. Chrome terminates idle extensions, so a scheduled alarm is the only reliable way to run a periodic scan.
* `tabs`: Reads the title of the active tab to label a scan with its stream name.
* `scripting` (optional, requested only if needed): Injects the Snip and Scan controls onto video elements.

Host access is limited to the five supported streaming domains — youtube.com, twitch.tv, tiktok.com, facebook.com and kick.com. StreamSnap does not run on any other site.

---

## 4. Data Sharing and Sale
We do **NOT** sell, rent, or trade your personal data to any third parties. StreamSnap AI contains no ad trackers or third-party analytics telemetry.

---

## 5. Contact
If you have any questions regarding this Privacy Policy, please contact us at:
**Email:** support@streamsnap.ai  
**Website:** https://streamsnap.ai
