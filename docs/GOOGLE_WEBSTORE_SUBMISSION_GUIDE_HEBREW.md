# 🚀 מדריך צעד-אחר-צעד: העלאת StreamSnap AI לחנות התוספים של גוגל (Chrome Web Store)

מדריך זה מרכז את כל הפעולות הדרושות כדי להעלות ולאשר את התוסף **StreamSnap AI** ב-**Google Chrome Web Store**.

כל הקבצים המוכנים להעלאה נמצאים בתיקייה:
📁 `dist/chrome_store_assets/`

---

## 📌 שלב 1: פתיחת חשבון מפתח ב-Google Chrome Web Store

1. היכנס לכתובת: **[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)**
2. התחבר עם חשבון ה-Google שלך.
3. אם זהו חשבונך הראשון, תתבקש לשלם אגרה חד-פעמית של **5$** לגוגל (דרישת אבטחה של גוגל לכל מפתח תוספים).
4. אשר את תנאי המפתחים (Developer Agreement).

---

## 📦 שלב 2: העלאת חבילת ה-ZIP של התוסף

1. בדשבורד המפתחים, לחץ על הכפתור הכחול **"+ New Item"** (פריט חדש).
2. גרור והעלה את קובץ ה-ZIP המוכן:
   📄 `dist/chrome_store_assets/streamsnap-extension-v1.3.0.zip`
3. המערכת תסרוק את ה-`manifest.json` ותפתח את טופס עריכת פרטי התוסף.

---

## 📝 שלב 3: מילוי פרטי החנות (Store Listing)

העתק והדבק את הפרטים הבאים מתוך `dist/chrome_store_assets/STORE_METADATA.md`:

* **Extension Name (שם התוסף):**
  `StreamSnap AI — Live Stream Visual Shopping`

* **Summary / Short Description (תיאור קצר - עד 132 תווים):**
  `Shazam for Live Streams: Instant visual product detection and 1-Click Amazon Cart for YouTube, Twitch, TikTok & Facebook Live.`

* **Detailed Description (תיאור מפורט):**
  העתק את הטקסט המלא מתוך `STORE_METADATA.md`.

* **Category (קטגוריה):**
  בחר `Shopping` (או `Productivity`).

* **Language (שפה ראשית):**
  בחר `English (United States)`.

---

## 🎨 שלב 4: העלאת תמונות ונכסים גרפיים (Graphic Assets)

העלה את הקבצים שהוכנו עבורך במידות המדויקות:

1. **Store Icon (אייקון חנות):**
   🖼️ `dist/chrome_store_assets/icon128.png` (גודל: 128x128)

2. **Screenshots (תמונות מסך - מינימום 1, מומלץ כולן):**
   🖼️ `dist/chrome_store_assets/screenshot_1_live_youtube_1280x800.png`
   🖼️ `dist/chrome_store_assets/screenshot_2_sidepanel_1280x800.png`
   🖼️ `dist/chrome_store_assets/screenshot_3_catalog_1280x800.png`
   🖼️ `dist/chrome_store_assets/screenshot_4_source_frame_1280x800.png`

3. **Small Promo Tile (טייל שיווקי קטן - 440x280):**
   🖼️ `dist/chrome_store_assets/promo_small_440x280.png`

4. **Marquee Promo Tile (באנר שיווקי גדול - 1400x560):**
   🖼️ `dist/chrome_store_assets/promo_marquee_1400x560.png`

---

## 🛡️ שלב 5: לשונית פרטיות והרשאות (Privacy Tab)

זהו השלב החשוב ביותר לאישור מהיר של גוגל ללא עיכובים:

1. **Single Purpose Description (מטרת התוסף במשפט אחד):**
   `StreamSnap AI visually detects commercial products and streaming gear visible in video streams and provides direct Amazon shopping links and 1-click cart integration.`

2. **Permission Justifications (הצדקת הרשאות מול צוות הבדיקה):**
   - **`sidePanel`**: Used to present product cards, visual similarity scores, and 1-Click Amazon Cart beside the active video stream without obscuring the video.
   - **`activeTab`**: Used to capture the visible video frame only when the user explicitly triggers a product scan or snip.
   - **`storage`**: Used to save the user's shopping cart, scan history, and optional API key locally in Chrome storage.
   - **`alarms`**: Used to maintain optional scheduled auto-scan timers without keeping heavy background processes alive.
   - **`tabs`**: Reads the title of the active tab to label detected products with their respective stream name.
   - **`scripting`**: Used to inject the interactive Snip overlay and floating scan buttons onto video elements on supported platforms.
   - **`host_permissions`** (`*://*.youtube.com/*`, `*://*.twitch.tv/*`, `*://*.tiktok.com/*`, `*://*.facebook.com/*`, `*://*.kick.com/*`): Required to attach video recognition controls and allow live product discovery on streaming platforms.

3. **Data Usage Declarations (שימוש בנתונים):**
   - סמן **No** על איסוף מידע אישי.
   - סמן **No** על מכירת מידע לצד שלישי.
   - סמן **No** על שימוש במידע למטרות שאינן קשורות לתוסף.

4. **Privacy Policy URL (קישור למדיניות פרטיות):**
   הזן את הקישור לדף הנחיתה שלך (למשל: `https://streamsnap.ai/privacy.html` או הקישור לדף הפרטיות ב-GitHub).

---

## 🚀 שלב 6: שליחה לבדיקה ואישור (Submit for Review)

1. לחץ על הכפתור הכחול **"Submit for Review"** בפינה העליונה.
2. תהליך הבדיקה של גוגל אורך בדרך כלל בין **24 ל-48 שעות**.
3. לאחר האישור, התוסף יהיה זמין לכל העולם בכתובת ציבורית ייעודית ב-Chrome Web Store!
4. תוכל להעתיק את ה-URL של התוסף בחנות ולהדביק אותו בדף הנחיתה.
