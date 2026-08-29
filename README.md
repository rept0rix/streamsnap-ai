# StreamSnap AI ⚡🛒

> **Universal Real-Time Visual Commerce for Live Streaming**  
> *Transforming live streams across YouTube, TikTok, Facebook Live, Twitch & Kick into 1-Click Amazon Shopping experiences.*

---

## 📌 סקירה כללית (Overview)

**StreamSnap AI** הוא מנוע מבוסס AI המאפשר לצופים בשידורי לייב לזהות כל פריט, מוצר, בגד או ציוד שמופיע על המסך בשידור חי, ולקבל קישור ישיר לרכישה או הוספה מיידית לעגלת הקניות באמזון (1-Click Add to Cart).

המערכת פועלת כתוסף כרום אוניברסלי (Universal Chrome Extension) מעל תגית הווידאו של כל פלטפורמת סטרימינג מובילה.

---

## 📑 מסמכי אפיון וארכיטקטורה (Documentation)

המסמך המלא והמפורט נמצא בתיקיית `docs/`:

👉 **[לצפייה במסמך האפיון המלא: PRODUCT_SPECIFICATION.md](docs/PRODUCT_SPECIFICATION.md)**

### תוכן המסמך:
1. **חזון הסטארטאפ ותקציר מנהלים**
2. **הבעיה בשוק וניתוח ההזדמנות (Market Gap)**
3. **מנוע הזיהוי התלת-שכבתי (3-Tier Engine):**
   * *שכבה 1:* זיהוי מדויק (Exact Match)
   * *שכבה 2:* מוצרים דומים (Look-Alikes)
   * *שכבה 3:* מנגנון בקשת איתור קהילתי/לייב (Live Request)
4. **תמיכה רב-פלטפורמית (YouTube, TikTok, Facebook Live, Twitch, Kick)**
5. **אינטגרציה ישירה לאקוסיסטם של אמזון (PA-API, AWS, 1-Click Cart)**
6. **תוכנית הדגמה ובדיקות MVP**
7. **אסטרטגיית רכישה/אקזיט מול אמזון (Built for Amazon M&A)**

---

## 🏗️ מבנה הפרויקט (Project Structure)

```text
excited-hopper/
├── docs/
│   └── PRODUCT_SPECIFICATION.md    # מסמך האפיון המלא והאסטרטגיה
└── README.md                       # סקירה ראשית
```
