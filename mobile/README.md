# StreamSnap AI — Mobile App

This is the mobile companion to the StreamSnap AI Chrome Extension. It brings the "Shazam for Live Streams" experience to your smartphone.

## Features
- **📸 Shazam for Shopping:** Point your camera or upload a screenshot to instantly identify products.
- **🔗 Share Extension (Coming in Native Build):** Share a TikTok, Instagram reel, or YouTube video directly to StreamSnap to extract products.
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

## Building the Native Share Extension

To implement the true "Grammarly/Shazam" background experience where StreamSnap appears in the iOS Share Sheet and Android Share Menu, a native build is required.

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
