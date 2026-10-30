# מדריך הגשה מלא ל-Apple App Store: StreamSnap AI 🍎🚀

מדריך זה כולל את כל המידע, הטקסטים (העתק-הדבק), התשובות לשאלוני אפל, והנחיות מדויקות להעלאת האפליקציה לחשבון המפתח ב-**App Store Connect**.

---

## 1. פרטי האפליקציה בחנות (App Store Listing)

### כותרות ותיאורים

* **שם האפליקציה (App Name - עד 30 תווים):**
  ```text
  StreamSnap AI: Shop Streams
  ```

* **כותרת משנה (Subtitle - עד 30 תווים):**
  ```text
  Shazam for Streams & Videos
  ```
  *(גרסה בעברית אם מגדירים שפה עברית):*
  ```text
  זיהוי מוצרים בשידורים חיים
  ```

* **מילות מפתח (Keywords - עד 100 תווים, מופרדים בפסיקים בלי רווחים):**
  ```text
  streamsnap,shopping,amazon,visual search,camera,live stream,twitch,tiktok,products,price tracker
  ```

* **טקסט לקידום (Promotional Text - עד 170 תווים):**
  ```text
  Instantly identify products in live streams & videos with AI and shop on Amazon in 1 click!
  ```

* **תיאור מלא (Description - עד 4,000 תווים):**
  ```text
  StreamSnap AI is your visual shopping assistant for live streams, social videos, and photos. Think of it as "Shazam for Products"!

  Ever watched a Twitch stream, YouTube Live, TikTok, or Instagram Reel and wondered:
  "What microphone is the streamer using?"
  "Where can I buy those headphones or that keyboard?"
  "What jacket or hoodie is the creator wearing?"

  With StreamSnap AI, you can identify gear, electronics, fashion, and accessories in seconds.

  ⚡ KEY FEATURES:
  • 1-Click Visual AI Detection: Powered by cutting-edge Gemini Vision AI to recognize products accurately.
  • Instant Amazon Matching: Direct, verified product listings and real-time pricing from Amazon.
  • Live Background Scan (Broadcast): Sample stream frames in real-time in the background while watching your favorite apps.
  • Live Camera & Screenshot Scanning: Point your camera at any screen or import screenshots from your gallery.
  • Share Extension Integration: Share any image or screenshot directly from TikTok, Twitter, or Instagram to StreamSnap.
  • 1-Click Amazon Cart: Add items straight to your cart and build your wishlist effortlessly.
  • Save & Bookmark: Keep track of discovered gear in your persistent offline catalog.

  🔒 PRIVACY FIRST:
  • Photos and video frames are processed ephemerally in real-time and never permanently stored.
  • We do not sell user data to third parties.
  • Bank-grade HTTPS/TLS encryption for all network requests.

  Affiliate Disclosure: StreamSnap AI is a participant in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites and apps to earn advertising fees by linking to Amazon.
  ```

---

## 2. קישורים ופרטי קשר (Support & URLs)

* **כתובת אתר תמיכה (Support URL - חובה באפל):**
  ```text
  https://streamsnap.online
  ```
* **כתובת אתר שיווקי (Marketing URL):**
  ```text
  https://streamsnap.online
  ```
* **קישור למדיניות פרטיות (Privacy Policy URL - חובה באפל):**
  ```text
  https://streamsnap.online/privacy.html
  ```

---

## 3. קבצים גרפיים מוכנים (Graphics & Screenshots)

הקבצים כבר מוכנים במידות המדויקות של אפל:

1. **אייקון האפליקציה לחנות (App Store Icon - 1024x1024 PNG):**
   * נתיב: `mobile/assets/icon.png` (ללא פינות מעוגלות וללא שקיפות, בדיוק כנדרש).

2. **צילומי מסך למכשירי 6.5 אינץ' / 6.7 אינץ' (1284x2778 PNG):**
   * צילום 1: `mobile/assets/appstore_screenshots/screenshot_1_6.5inch.png`
   * צילום 2: `mobile/assets/appstore_screenshots/screenshot_2_6.5inch.png`
   * צילום 3: `mobile/assets/appstore_screenshots/screenshot_3_6.5inch.png`

---

## 4. שאלון פרטיות אפל (App Privacy / Nutrition Labels)

במסך **App Privacy** ב-App Store Connect יש לסמן:

1. **Data Collection:**
   * האם האפליקציה אוספת נתונים? סמן **Yes**.
2. **Data Types:**
   * **Photos or Videos (תמונות/וידאו):**
     * מטרת האיסוף: **App Functionality** (תפעול האפליקציה לזיהוי מוצרים).
     * האם משויך לזהות המשתמש (Linked to User)? סמן **No** (העיבוד מתבצע ללא קישור לחשבון).
     * האם משמש למעקב (Tracking)? סמן **No**.
   * **User ID / Contact Info (אימייל / מזהה - רק אם המשתמש בוחר להתחבר):**
     * מטרת האיסוף: **App Functionality** (סנכרון עגלת קניות בין מכשירים).
     * האם משויך לזהות המשתמש? סמן **Yes**.
     * האם משמש למעקב? סמן **No**.
3. **Tracking:**
   * האם אתה משתמש בנתונים למעקב (Tracking) ברחבי אפליקציות של חברות אחרות? סמן **No**.

---

## 5. הערות לבודק אפל (App Review Information)

אפל מחמירה מאוד בבדיקה, במיוחד בנוגע להרשאות מסך ומצלמה:

* **פרטי חשבון בדיקה (Sign-In Required):**
  * סמן: **No / Not Required** (האפליקציה מאפשרת שימוש מלא כאורח ללא צורך בהתחברות).
* **הערות לבודק (Review Notes):**
  ```text
  StreamSnap AI allows users to visually identify products and stream gear.

  Features to test:
  1. Camera Scan: Point camera at any gadget, microphone, or fashion item to identify it on Amazon.
  2. Photo Library: Pick any screenshot from photo library to find matching products.
  3. Live Scan: Uses ReplayKit Broadcast Upload Extension (`org.name.StreamSnapAI.BroadcastExtension`) to sample frames while the user switches to video streaming apps (TikTok, YouTube).
  4. Cart: Add detected items to Amazon cart. External links redirect to official Amazon product pages via Safari / universal links.
  ```

---

## 6. דרכי העלאה ל-App Store Connect

### שיטה א': באמצעות Xcode (הדרך המומלצת ביותר ב-Mac)
1. פתח את פרויקט ה-iOS:
   ```bash
   open mobile/ios/StreamSnapAI.xcworkspace
   ```
2. בחר ב-Target: **StreamSnapAI** וב-Destination בחר **Any iOS Device (arm64)**.
3. בתפריט העליון לחץ על: **Product -> Archive**.
4. עם סיום הארכיב ייפתח חלון ה-**Organizer**.
5. לחץ על **Distribute App** -> **App Store Connect** -> **Upload**.
6. המתן להשלמת ההעלאה. הגרסה תופיע תוך מספר דקות ב-App Store Connect בלשונית **TestFlight** / **App Store**.

### שיטה ב': באמצעות EAS CLI
1. התחבר לחשבון ה-Expo שלך:
   ```bash
   npx eas-cli login
   ```
2. הפעל בנייה והעלאה אוטומטית לענן:
   ```bash
   npx eas-cli build --platform ios --auto-submit
   ```
