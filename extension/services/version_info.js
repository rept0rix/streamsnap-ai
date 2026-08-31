/**
 * StreamSnap AI — Version & Build Metadata
 * Centralized source of truth for versioning, build timestamps, and changelog history.
 */

export const CURRENT_BUILD = {
  version: "1.5.2",
  buildDate: "2026-08-31",
  buildTime: "14:45",
  buildTimestamp: "2026-08-31 14:45:00 IDT",
  title: "TikTok Left Dock & Direct Click Shielding",
  highlights: [
    "🚀 TikTok Left Dock: Relocated in-video toolbar to a sleek vertical sidebar dock on the left side (left: 16px, top: 100px) — 100% clear of creator profile, '+ Follow' button and gift overlays.",
    "🛡️ Event Shielding: Intercepts all mouse/pointer/touch events with stopImmediatePropagation so video players (TikTok/Twitch/YouTube) cannot intercept or block button clicks.",
    "🖐️ Draggable Floating Dock: Move the toolbar freely anywhere on the video screen by dragging the ⋮⋮ handle.",
    "📱 Vertical Icon Stacking: Compact 54px dock with vertically aligned icons (Scan ⚡, Snip 🎯, Live 🟢).",
    "🔍 Built-in Version Tracker: Full in-app release date, time, and changelog history viewer."
  ]
};

export const VERSION_HISTORY = [
  CURRENT_BUILD,
  {
    version: "1.5.1",
    buildDate: "2026-08-31",
    buildTime: "14:32",
    buildTimestamp: "2026-08-31 14:32:00 IDT",
    title: "Initial TikTok HUD & Drag Support",
    highlights: [
      "Added getPlayerContainer() for TikTok feed & live players.",
      "Added base drag handle support.",
      "Prevented click event bubbling."
    ]
  },
  {
    version: "1.5.0",
    buildDate: "2026-08-31",
    buildTime: "13:40",
    buildTimestamp: "2026-08-31 13:40:00 IDT",
    title: "UI/UX Pro Max Vector System & Adaptive Product Thumbnails",
    highlights: [
      "Converted raw emojis to inline SVG vector icons.",
      "Adaptive thumbnail engine distinguishing real crops from Amazon catalog photos.",
      "Official website link integration (streamsnap.online)."
    ]
  },
  {
    version: "1.4.0",
    buildDate: "2026-08-25",
    buildTime: "11:00",
    buildTimestamp: "2026-08-25 11:00:00 IDT",
    title: "Google OAuth & Cloudflare Proxy",
    highlights: [
      "Google Identity OAuth Sign-in integration.",
      "Secure backend Cloudflare worker proxy.",
      "Complete data privacy and retention removal tools."
    ]
  }
];
