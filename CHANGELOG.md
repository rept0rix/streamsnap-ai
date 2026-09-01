# Changelog

All notable changes to the **StreamSnap AI** Chrome Extension & Web Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
