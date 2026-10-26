# 1.6.4 scan fix

## Root causes (1.6.3)
1. content.js refused to scan without a session or Gemini key (only a toast).
2. `chrome.tabs.captureVisibleTab` needs `<all_urls>` or an activeTab grant; in-page buttons, crop and auto-scan never grant activeTab, so the screenshot fallback failed on sites with cross-origin/DRM video (TikTok, Facebook, ...).

## Changes
- content.js: sign-in gate removed; unsigned scans go to `/resolve` with installId. Server 401/403 -> `AUTH_REQUIRED` -> side panel shows sign-in.
- manifest: `optional_host_permissions: ["<all_urls>"]` (not mandatory), version 1.6.4.
- background: on capture failure without the permission, sets `needsCapturePermission` and notifies the panel.
- sidepanel: one-click "Allow" banner calls `chrome.permissions.request` inside a real click (content scripts can't request permissions; a message to the background loses the user gesture).
- worker (NOT deployed): unsigned `/resolve` capped at `ANON_PER_DAY=10` per installId per day, then 401 `{code:"auth_required"}`. Existing hourly/daily caps unchanged.

## Tradeoff: optional vs mandatory `<all_urls>`
- Optional: no scary "read and change all your data on all websites" warning at install, lighter CWS review, existing users not disabled on update. Cost: one extra click the first time a site blocks direct capture; users who decline must use the toolbar icon / Alt+Shift+S (activeTab).
- Mandatory: zero-friction capture everywhere, but install warning, in-depth review, and Chrome disables the extension for existing users until they accept the new permission on update.

## Deploy order
Deploy the worker first (unsigned scans already work today, without the cap), then submit 1.6.4.
