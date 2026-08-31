# Changelog

All notable changes to the **StreamSnap AI** Chrome Extension & Web Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
