# Changelog

All notable changes to the **StreamSnap AI** Chrome Extension & Web Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] / next

### Known issues (not fixed yet)
- **Side panel scan gate targets a missing element**: `extension/sidepanel/sidepanel.js` (~L483, in the sign-in gate logic) queries `#scan-results-view`, which doesn't exist; the element in `sidepanel.html` is `#scan-results-container`. Not fixed in 1.6.4.
- **Mobile app gives up before the worker**: the mobile app's request timeout (25s) equals the worker's `/resolve-url` deadline (25s), so the app usually times out first and never sees the worker's 504.
- **`/resolve-url` 504 route test coverage**: the test covers a hanging page fetch, not a slow AI step.

---

## [1.6.4] - 2026-09-29 (16:50 IDT)

### Changed
- **Honest creator-tag copy**: An Associates tag entered in Setup only applies to links opened in that user's own browser; nothing maps a channel to its creator's tag. Removed every promise that creators earn commission from their viewers:
  - Onboarding "1-Click Amazon Cart" card: now "Add what you find to a Remote Cart and check out on Amazon in one go."
  - Onboarding settings subtitle: now "Set your overlay controls and how sensitive product detection is."
  - Onboarding Associates tag card: removed the "Earn 100% Commission" badge; the help text now reads "Optional. If you have an Amazon Associates ID (e.g. `yourname-20`), links you open in this browser will use it. It doesn't apply to purchases your viewers make."
  - Side panel Stats (sign-in gate and header): now describe scans, Amazon clicks and cart adds, with an estimated commission figure.
  - Side panel Settings setup guide and tag help text: now say links you open in this browser use your tag (no more "earn 100% of your affiliate commissions").
  - README Monetization: the creator-tag bullet now explains the tag only applies in your own browser and that channel-to-creator mapping is a pending decision.
- **Removed commission ranges**: The side panel's "1%–20%" per-category rate list and the README's "1%–10%" range are replaced with "Amazon sets the rate by product category."
- **Version**: `extension/manifest.json` and the in-extension version constants (`services/version_info.js`, side panel badges, content-script build log, device name) report **1.6.4**. The worker's `LATEST_EXTENSION_VERSION` / `MIN_EXTENSION_VERSION`, the landing page badges and the `landing_page/assets/` zips stay at 1.6.3 until the Chrome Web Store submission.

---

## [1.6.3] - 2026-09-07 (09:30 IDT)

### Added
- **Auth Gates for History, Cart & Stats**: These side panel tabs now require Google sign-in; the Settings tab places Google Sign-in / Account & Quota as the primary top card, and History/Cart badge counters show `0` when signed out instead of leaking stale counts.
- **Soft Update Banner**: When `/version` reports a newer `latestVersion`, the side panel shows a dismissible "update available" banner (in addition to the hard gate for builds below `minVersion`).

### Changed
- **Product Card Actions**: Redesigned into a clean 2-tier hierarchy with readable store pills.
- **Version Unity**: `extension/manifest.json`, the worker's `LATEST_EXTENSION_VERSION` (served by `/version`), the in-extension version badges, the landing page badges / dynamic-version fallbacks and the packaged ZIP in `landing_page/assets/` now all report **1.6.3**. `MIN_EXTENSION_VERSION` remains `1.6.0` (no forced-update bump). The previously published `streamsnap-extension-v1.6.2.zip` is kept as an archive only; `tools/package.sh` no longer deletes older versioned zips.

### Fixed
- **Memory**: Capture canvases are released after `toDataURL`, manifest permissions were tightened, and Gemini JSON parsing was hardened against malformed model output.

---

## [1.6.1] - 2026-09-01 (13:15 IDT)

### Fixed
- **Scanning found nothing / appeared stuck**: The on-video **Scan** and **Snip** buttons (content script) hard-required a personal Gemini API key and returned early when none was set — so a signed-in user could never scan, and the server-side `/resolve` path was unreachable dead code. All scan entry points now proceed when **either** a Gemini key **or** a sign-in session is present, and pass `apiKey: null` so the service worker falls back to server-side visual search.
- **Signed-in scans sent anonymously**: `callServerResolve` read the session token from `streamSnapSession`, but the account service stores it as `sessionToken`. Corrected (with a fallback), so signed-in scans authenticate and attribute to the account's quota.
- **Loading spinner could hang forever**: When a scan ended without a result (aborted capture, missing credential on a page-initiated scan), `isScanning` flipped to `false` but the side panel never cleared the "AI Vision Scanning…" state. The panel now returns to the ready/results state and surfaces `lastScanError`.

---

## [1.6.0] - 2026-09-01 (12:20 IDT)

### Added
- **Forced Update Gate**: The side panel now polls the server's `/version` endpoint on open and hard-blocks with a full-screen "Update required" screen when the installed build is older than the server's `minVersion`. The gate fails open on network errors (a worker outage never bricks the extension) but stays blocked once a build is positively known to be outdated. Controlled server-side via `MIN_EXTENSION_VERSION` in `wrangler.toml` and returned in both `/version` and `/auth/me`.
- **Account in Header**: The signed-in Google account (avatar, name, email) now appears at the top of every tab, alongside a one-click **Sign out** button and a **Sign in with Google** prompt when signed out.
- **Master On/Off Switch**: A power toggle in the header enables or disables the whole extension. State is stored in `extensionEnabled`.
- **OFF Guard State**: While disabled, the side panel shows a full guard screen with a "Turn StreamSnap on" button, and the video page shows a fixed "⚡ StreamSnap is OFF" pill so the state is unmistakable on-page.

### Changed
- **Background Safety**: When the extension is off, auto-scan `chrome.alarms` are cleared, the keyboard shortcut is ignored, and the service worker refuses `ANALYZE_WITH_AI` / `ANALYZE_CROPPED_IMAGE`. On-video controls are stripped and scans refused in the content script too.

---

## [1.5.2] - 2026-08-31 (14:45 IDT)

### Added
- **TikTok Left-Side Vertical Dock**: Relocated video action buttons to a compact vertical palette on the left edge (`left: 16px; top: 100px`) with stacked icons (`Scan ⚡`, `Snip 🎯`, `Live 🟢`), completely eliminating overlap with the creator header, "+ Follow" (+ לעקוב) button, and gift overlays.
- **Built-in Version & Build Tracker**:
  - Live version & timestamp badge in Sidepanel footer and Settings tab with detailed changelog breakdown.
  - Content script startup banner in DevTools console showing active build and platform.
  - Hover tooltips on video drag handle (`⋮⋮`) displaying current build version and timestamp.

### Fixed
- **Complete Event Shielding**: Added `stopImmediatePropagation` across all pointer/mouse/touch events preventing TikTok web player overlays from intercepting user clicks.

---

## [1.5.1] - 2026-08-31 (14:32 IDT)

### Fixed
- **TikTok Player Collision & Click Interception**:
  - Replaced shallow container selection with deep `getPlayerContainer()` targeting TikTok's top-level video card containers (`[data-e2e="feed-video"]`, `.tiktok-web-player`, `.xgplayer`).
  - Added full event shielding (`stopPropagation` & `stopImmediatePropagation` on mouse, pointer, touch, and click events) preventing TikTok from capturing clicks or toggling video play/pause.
  - Adjusted TikTok positioning (`top: 72px`) safely below TikTok's author info header, "+ Follow" (+ לעקוב) button, and share icon.
  - Added interactive draggable handle (`⋮⋮`) allowing users to drag and position the toolbar anywhere across any video.
  - Updated TikTok stream title and channel description DOM selectors.

---

## [1.5.0] - 2026-08-31

### Added
- **UI/UX Pro Max Vector System**: Complete conversion of all raw Unicode emojis to accessible, high-contrast inline SVG icons (Heroicons/Lucide style) across the Sidepanel, In-Video HUD, and Marketing Landing Page.
- **Adaptive Product Thumbnail Engine**:
  - Automatically identifies if a product detection has a verified Amazon catalog image or is a live stream visual detection.
  - Renders a clean, high-resolution single thumbnail (`.product-single-thumb`) with live video frame crop and gold hover zoom effect for real-world detections.
  - Dynamically switches to dual-comparison (`[Live]` $\to$ `[Amazon]`) only when a confirmed distinct catalog photo exists.
- **Official Website Integration**:
  - Embedded direct links to `https://streamsnap.ai` across the extension header, header navigation button (`Website ↗`), settings portal card, and panel footer.
  - Added `"homepage_url": "https://streamsnap.ai"` in `manifest.json`.
- **Accessibility & Motion Tokens**:
  - Added `@media (prefers-reduced-motion: reduce)` support to gracefully handle live pulses and radar sweeps.
  - Added explicit golden `:focus-visible` focus rings for keyboard navigation.

### Fixed
- **Missing / Template Placeholder Images**: Eliminated artificial second SVG placeholder rectangles ("template cards") appearing next to real stream crops.
- **Source Frame Traceability Modal**: Dynamically adjusts layout to expand live frame zoom when no second catalog image exists.

---

## [1.4.0] - 2026-08-25

### Added
- **Google OAuth Sign-In**: Streamlined authentication flow via Google Identity, removing the need for manual API key pasting.
- **Cloudflare Worker Proxy**: Secure backend proxy with quota tracking and rate limit management (`streamsnap-lens.workers.dev`).
- **Data Privacy & Retention Controls**: Complete deletion capabilities for cached scans, user accounts, and discovered catalogs.

---

## [1.3.1] - 2026-08-20

### Added
- **Official Affiliate Tag**: Integrated `streamsnap03-20` across all Amazon search, direct listing, and remote cart generation links.
- **Verified Product Catalog**: Built-in canonical ASIN database for popular streaming microphones, headphones, lighting, and gear.

---

## [1.3.0] - 2026-08-15

### Added
- **Amazon Remote Cart**: Multi-item remote cart generation (`/gp/aws/cart/add.html`) staging multiple finds across a stream.
- **Perceptual Hash Frame Cache (pHash)**: Skipping duplicate Vision API calls on static stream backgrounds.
- **In-Video HUD Controls**: Floating `Click-to-Find`, `Snip Box`, and `Scan Frame` overlay on YouTube, Twitch, TikTok, Kick, and Facebook.
