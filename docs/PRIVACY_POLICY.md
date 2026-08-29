# Privacy Policy for StreamSnap AI

**Last updated:** August 29, 2026

StreamSnap AI ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how our Chrome extension collects, uses, and safeguards information when you use StreamSnap AI.

---

## 1. Information We Process

### Video Frame Captures
When you explicitly initiate a scan (by clicking "Scan Live Products", "Snip & Search on Video", or using keyboard shortcuts), StreamSnap AI captures a frame or cropped region of the active video stream for real-time visual recognition.

* **Purpose:** Frame data is processed solely to extract visual features and identify visible products (fashion, audio gear, accessories).
* **Storage:** Captured images are processed in-memory and stored locally on your device (`chrome.storage.local`). We do NOT store your video frames or browsing history on external private servers.

### API Keys and Preferences
Your Gemini API key and visual search preferences are stored locally in your browser via `chrome.storage.local`. They are never transmitted to third parties other than the official Google Gemini API endpoint (`generativelanguage.googleapis.com`) to execute visual queries requested by you.

---

## 2. Third-Party Services

* **Google Gemini API:** When visual analysis is performed, image data is transmitted directly to Google's Generative AI API using your configured API key according to Google's Privacy Policy.
* **Amazon Commerce Services:** When you click "Add to Cart" or view matching products, you are directed to Amazon.com with our standard affiliate referral tag. We do not receive, collect, or store your Amazon account credentials, credit card details, or personal purchase history.

---

## 3. Permissions Justification

* `sidePanel`: Required to display live product cards, visual match scores, and 1-Click Amazon Cart beside live video streams.
* `activeTab`: Required to capture the visible live stream video frame when you click "Scan".
* `storage`: Required to save your cart items, stream history, and API key locally on your device.
* `scripting`: Required to inject the interactive Snip and Scan controls onto video elements on supported platforms (YouTube, Twitch, TikTok).

---

## 4. Data Sharing and Sale
We do **NOT** sell, rent, or trade your personal data to any third parties. StreamSnap AI contains no ad trackers or third-party analytics telemetry.

---

## 5. Contact
If you have any questions regarding this Privacy Policy, please contact us at:
**Email:** support@streamsnap.ai  
**Website:** https://streamsnap.ai
