/**
 * StreamSnap AI — Version & Build Metadata
 * Centralized source of truth for versioning, build timestamps, and changelog history.
 */

export const CURRENT_BUILD = {
  version: "1.6.1",
  buildDate: "2026-09-01",
  buildTime: "13:15",
  buildTimestamp: "2026-09-01 13:15:00 IDT",
  title: "Scanning Fix — Server Scan Works Without a Key",
  highlights: [
    "🐛 Fixed 'nothing found / stuck scanning': the on-video Scan and Snip buttons no longer require a personal Gemini key. If you're signed in, scans now run on our servers as intended.",
    "🔑 Fixed signed-in scans being sent anonymously (wrong session-token key), so your account quota is attributed correctly.",
    "⏳ Fixed the loading spinner hanging forever when a scan ended without a result — it now returns to the ready state.",
    "📡 Works on YouTube, Twitch, TikTok, Facebook and Kick via server-side visual search when no key is set."
  ]
};

export const VERSION_HISTORY = [
  CURRENT_BUILD,
  {
    version: "1.6.0",
    buildDate: "2026-09-01",
    buildTime: "12:20",
    buildTimestamp: "2026-09-01 12:20:00 IDT",
    title: "Forced Updates, Account Header & Master On/Off",
    highlights: [
      "🔒 Forced Update Gate: server-driven minimum version with a hard 'Update required' block.",
      "👤 Account in Header: signed-in Google account and Sign out on every tab.",
      "⚡ Master On/Off Switch with OFF guard on the panel and video page."
    ]
  },
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
