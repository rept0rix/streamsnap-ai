/**
 * StreamSnap AI — Version & Build Metadata
 * Centralized source of truth for versioning, build timestamps, and changelog history.
 */

export const CURRENT_BUILD = {
  version: "1.6.0",
  buildDate: "2026-09-01",
  buildTime: "12:20",
  buildTimestamp: "2026-09-01 12:20:00 IDT",
  title: "Forced Updates, Account Header & Master On/Off",
  highlights: [
    "🔒 Forced Update Gate: The panel now checks the server for a required minimum version and hard-blocks with an 'Update required' screen when this build is too old — no bypass.",
    "👤 Account in Header: Your signed-in Google account (name, email, avatar) now shows at the top of every tab, with a one-click Sign out button.",
    "⚡ Master On/Off Switch: A power toggle in the header turns the whole extension on or off. While off, nothing runs in the background.",
    "🛡️ OFF Guard: When disabled, the side panel shows a clear guard screen and the video page shows an 'OFF' pill, so you always know its state.",
    "🚫 Background Safety: Auto-scan alarms and scans are refused whenever the extension is off."
  ]
};

export const VERSION_HISTORY = [
  CURRENT_BUILD,
  {
    version: "1.5.2",
    buildDate: "2026-08-31",
    buildTime: "14:45",
    buildTimestamp: "2026-08-31 14:45:00 IDT",
    title: "TikTok Left Dock & Direct Click Shielding",
    highlights: [
      "🚀 TikTok Left Dock: Relocated in-video toolbar to a vertical sidebar dock clear of creator profile and gift overlays.",
      "🛡️ Event Shielding: stopImmediatePropagation so video players cannot block button clicks.",
      "🖐️ Draggable Floating Dock and built-in version tracker."
    ]
  },
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
