# Google Play and App Store listing — StreamSnap AI

Copy-paste text, policy answers, and reviewer notes for the **iOS / Android app** (`com.streamsnap.ai`, version 1.0.0).

Chrome Web Store is already live. Do **not** upload `landing_page/assets/streamsnap-android-latest.apk` to Play — that file is a sideload tester APK. Play requires an **Android App Bundle (AAB)** from EAS `production`.

Privacy policy URL (required by both stores):

`https://streamsnap.online/privacy.html`

Graphics generated for Play:

* Icon 512×512: `docs/store_assets/play_icon_512.png`
* Feature graphic 1024×500: `docs/store_assets/play_feature_graphic_1024x500.png`

Phone screenshots still need to be captured on a real device after installing the tester APK. Play: at least 2 phone screenshots. App Store: iPhone 6.7" (and 6.1" if you support it).

---

## 1. Shared listing copy

### App name

`StreamSnap AI`

### Subtitle / short name (Apple, 30 chars max)

`Live stream visual shopping`

### Play short description (80 chars max)

`Find products on TikTok and YouTube. Live Scan, then tap to buy on Amazon.`

(74 characters)

### Full description (Play + App Store)

```
StreamSnap AI finds the products you see on live streams and short videos, then takes you to the matching Amazon listing.

HOW IT WORKS
1. Open StreamSnap and tap Live Scan.
2. Allow screen capture (Android) or start StreamSnap Live Scan in the iOS broadcast picker.
3. Switch to TikTok, YouTube, Instagram Reels, or another video app.
4. Pause on a hoodie, mic, light, or cup. StreamSnap identifies it and saves it to your catalog.
5. Tap STOP in the floating pill, the radar, or the notification when you are done.

ALSO IN THE APP
• Camera scan — point at a product in the room
• Gallery scan — pick a screenshot
• Catalog and 1-click Amazon cart staging
• Optional Google Sign-In to keep history and quota across devices

PRIVACY
Live Scan does not run until you start it. Android shows a persistent Live Scan notification while capture is on. Locking the phone or tapping STOP ends capture. Frames are used only to match products. We do not sell your data.

StreamSnap is free. Amazon links may use an Associates tag; you pay the same price.
```

### Category

Shopping (primary). Alternative: Lifestyle.

### Language

English (United States)

### Support URL

https://streamsnap.online

### Marketing URL

https://streamsnap.online

### Contact email

naor@streamsnap.online

---

## 2. Google Play — Data safety

Declare **data collected** (not sold). All optional except install ID sent with scans.

| Data type | Collected | Shared | Required | Purpose |
| --- | --- | --- | --- | --- |
| Name | Yes (Google Sign-In) | No | Optional | App functionality (account) |
| Email | Yes (Google Sign-In) | No | Optional | App functionality (account) |
| User IDs | Yes (account id / install id) | No | Install ID required for scans | App functionality, abuse prevention |
| Photos | Yes (if user picks a gallery image or Live Scan captures a frame) | Yes — sent to our Worker / Gemini for recognition only | Optional (user starts the scan) | App functionality |
| App activity (scan catalog on device) | Yes, on device | No | Optional | App functionality |
| Crash logs | No | — | — | — |
| Advertising ID | No | — | — | — |

* **Is this data encrypted in transit?** Yes (HTTPS).
* **Can users request deletion?** Yes — sign out / clear catalog in-app; email naor@streamsnap.online to delete the cloud account.
* **Sold?** No.
* **Used for ads or “personalization” beyond the product?** No.

Photos / video: collected **only** when the user starts camera, gallery, or Live Scan. Do **not** claim “no photos” — Live Scan is a still frame of the screen.

---

## 3. Google Play — Photo and video permissions

If Play Console asks why `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE` / Camera:

**Use case:** Photo and video (core). Users pick a screenshot or take a camera still so StreamSnap can identify a product. Live Scan uses the MediaProjection API (still frames), not the camera, after the user accepts the system capture prompt.

**Declaration video (record on a phone):**

1. Open StreamSnap → tap Live Scan → accept screen capture.
2. Switch to YouTube or TikTok → pause on a product → show a find notification / catalog card.
3. Tap STOP (pill or notification).
4. Optionally: Gallery scan of a screenshot.

Keep the clip under 30 seconds. Upload it in App content → Photo and video permissions **and** in Foreground service.

---

## 4. Google Play — Foreground service `mediaProjection`

App content → Foreground service types → **Media projection**.

**Description for reviewers:**

StreamSnap Live Scan is a user-started screen capture so the shopper can identify products while watching TikTok, YouTube, or Reels in another app. Capture starts only after the user taps Live Scan and accepts the system MediaProjection dialog. A foreground service of type `mediaProjection` keeps sampling still frames while the user switches apps. A persistent notification (“StreamSnap Live Scan”) remains visible, with a Stop action. A STOP pill is drawn over the screen for the duration of the projection. The user can also stop from the in-app radar. Capture ends if the user locks the device or taps the system screen-share chip. We do not record audio. We do not capture when Live Scan is off. Frames are sent to our vision API solely to return shopping matches.

**User-initiated / perceptible:** Yes — Live Scan tap, system permission, ongoing notification, STOP control.

**Demo video:** same Live Scan clip as section 3.

---

## 5. Google Play — other App content

* **Content rating:** Complete the IARC questionnaire. Expected everyone / PEGI 3 style shopping utility. No user-generated public chat.
* **Target audience:** 18+ (shopping / Amazon). Not for children.
* **News app / COVID / data safety ads:** No.
* **Financial features:** No.
* **Government / political:** No.
* **Closed testing (personal developer account created after 13 Nov 2023):** at least **12 testers opted in for 14 continuous days**, then apply for production from the dashboard.

Release track for the first AAB: **Internal testing** or **Closed testing**, not Production.

---

## 6. Apple App Store — review notes

Paste into App Review Information → Notes:

```
StreamSnap AI is a visual shopping companion. The core “Live Scan” feature uses ReplayKit Broadcast Upload.

How to test Live Scan:
1. Sign in with Google if you want quota, or skip to try the anonymous allowance.
2. On the home screen tap Live Scan. iOS shows the system broadcast picker — choose “StreamSnap Live Scan” (not Share).
3. Switch to TikTok or YouTube, pause on a visible product (hoodie, microphone, cup).
4. Return to StreamSnap; the catalog should list matches. Notifications may appear if allowed.
5. Stop by tapping STOP in StreamSnap (opens the broadcast picker again) or from the red iOS status bar.

The app does not record audio. NSMicrophoneUsageDescription is present only because iOS may show a microphone toggle on the broadcast picker; the toggle should stay off.

App Group group.com.streamsnap.ai must be enabled on the team so the broadcast extension can write finds for the container app.

Privacy policy: https://streamsnap.online/privacy.html
```

### Privacy Nutrition Labels (App Privacy)

| Type | Linked to identity | Used for tracking | Purpose |
| --- | --- | --- | --- |
| Name, Email, User ID | Yes if signed in | No | App Functionality |
| Photos or Videos | No (frames are not tied to a name unless signed in) | No | App Functionality |
| Product Interaction (on device) | No | No | App Functionality |

Do not declare tracking. Do not declare advertising.

### Info.plist already in the app

See `mobile/app.config.js`: camera, photo library, microphone (broadcast picker only), App Group `group.com.streamsnap.ai`.

After Apple Developer is approved, create:

* App ID `com.streamsnap.ai`
* App Group `group.com.streamsnap.ai`
* Broadcast Upload Extension App ID `com.streamsnap.ai.BroadcastExtension` (or the Expo-generated `.BroadcastExtension` bundle)

---

## 7. Builds (after Expo login)

The Expo project is already linked in `mobile/app.config.js` as `extra.eas.projectId` = `0538ed35-21ea-4c96-9755-0cd4bbbbd7f8`.

Do **not** use Expo Go for Live Scan. ReplayKit and MediaProjection need a native build (`eas build` or `npx expo run:android` / `run:ios`).

```bash
cd mobile
npx eas-cli login
npx eas-cli init --id 0538ed35-21ea-4c96-9755-0cd4bbbbd7f8 --non-interactive --force
npx eas-cli build --platform android --profile production   # AAB for Play
npx eas-cli build --platform ios --profile production       # IPA for App Store
npx eas-cli submit --platform android --profile production  # draft / internal
npx eas-cli submit --platform ios --profile production      # needs Apple team + ascAppId
```

`eas.json` submit.android uses track `internal` and `releaseStatus: draft` so the first upload does not go straight to production.

Fill `submit.production.ios.appleId` / `ascAppId` only after the App Store Connect app exists.

---

## 8. Screenshots still needed from a phone

Capture after installing https://streamsnap.online/assets/streamsnap-android-latest.apk (Android) or a TestFlight build (iOS):

1. Home radar (Live Scan idle)
2. Live Scan active + STOP visible
3. Catalog with a product card (video frame vs Amazon match)
4. Optional: cart

Do not use emulator-only shots if Play asks for a real device.
