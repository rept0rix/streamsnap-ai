# StreamSnap AI — Mobile App

This is the mobile companion to the StreamSnap AI Chrome Extension. It brings the "Shazam for Live Streams" experience to your smartphone.

## Features
- **📡 Live background scan:** Start once in StreamSnap, switch to TikTok / YouTube / Reels. Frames are sampled in the background and products accumulate in the catalog — no Share Sheet.
- **📸 Camera / gallery snap:** Point the camera or upload a screenshot to identify a single item.
- **🛒 Remote Amazon Cart:** Build a multi-item cart straight from your phone.
- **📦 Persistent Catalog:** Saves your discovery history locally using AsyncStorage.

## Tech Stack
- **Framework:** React Native / Expo (SDK 52)
- **Routing:** Expo Router
- **State:** Zustand
- **Camera:** `expo-camera`
- **Vision Integration:** Cloudflare Worker (Same backend as the extension)

## Quick Start (No Apple Developer Account needed for this step)

You can run the app immediately in a local simulator or on your physical device using Expo Go.

1. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```

2. Start the Metro bundler:
   ```bash
   npx expo start
   ```

3. Run on a device:
   - **iOS:** Press `i` to open in iOS Simulator (requires Xcode), or scan the QR code with the Expo Go app on your physical iPhone.
   - **Android:** Press `a` to open in Android Emulator, or scan with Expo Go on Android.

## Live background scan (iOS)

iOS will not let an app silently read another app's screen. The legal path is a ReplayKit **Broadcast Upload Extension**:

1. Tap **Live Scan** in StreamSnap.
2. In the system picker, start **StreamSnap Live Scan** (not Share).
3. Open TikTok / YouTube / Instagram. iOS shows a red status bar while broadcasting.
4. StreamSnap samples a frame about every 5 seconds, skips near-duplicates, and stacks finds in the catalog.

This requires a native build (`npx expo run:ios --device`), not Expo Go. The App Group `group.com.streamsnap.ai` must exist on the Apple Developer team.

## Building the Native Share Extension

Share Sheet is the fallback for a single screenshot or URL. A native build is required.

### Android
Android share intents are handled via the `expo-share-intent` plugin configured in `app.config.js`. You just need to build the app:
```bash
npx expo run:android
```

### iOS
The iOS Share Extension requires a native Swift target and an Apple Developer account to configure App Groups (so the extension can share data with the main app).
```bash
npx expo prebuild --clean
npx expo run:ios
```
*Note: A developer account is required to provision the App Group entitlements.*
