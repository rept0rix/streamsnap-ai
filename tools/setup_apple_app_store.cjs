const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ISSUER_ID = "70c9685e-8bd7-4050-9947-46e8d30e0a3f";
const KEY_ID = "Q2Q7AWQ232";
const KEY_PATH = "/Users/naoryanko/.private_keys/AuthKey_Q2Q7AWQ232.p8";

const APP_ID = "6818436455";
const VERSION_ID = "60325552-277c-471c-89e1-5c6ef40d5b56";
const VERSION_LOC_ID = "dd95ee3f-1af5-47a7-a3ba-2de41a5310e1";
const APP_INFO_ID = "fc3da816-2d91-4ce5-9845-a4db83f0edcd";
const APP_INFO_LOC_ID = "85f4c928-6e40-430a-81f3-9f010065a02b";
const DIST_CERT_ID = "76YN89449G";

const BUNDLE_IDS = [
  { id: "FNFD52X63Z", name: "StreamSnapAI App Store", bundleId: "org.name.StreamSnapAI" },
  { id: "ST6A3N8P3Z", name: "StreamSnapAI Broadcast App Store", bundleId: "org.name.StreamSnapAI.BroadcastExtension" },
  { id: "2CU45FV226", name: "StreamSnapAI Widget App Store", bundleId: "org.name.StreamSnapAI.LiveScanWidget" }
];

function makeJwt() {
  const priv = fs.readFileSync(KEY_PATH, "utf8");
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ iss: ISSUER_ID, iat: now - 30, exp: now + 900, aud: "appstoreconnect-v1" })
  ).toString("base64url");
  const sig = crypto
    .sign("sha256", Buffer.from(`${header}.${payload}`), { key: priv, dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return `${header}.${payload}.${sig}`;
}

async function api(method, endpoint, body = null) {
  const token = makeJwt();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  const res = await fetch(`https://api.appstoreconnect.apple.com${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {}
  if (!res.ok) {
    console.warn(`[WARN] ${method} ${endpoint} -> ${res.status}:`, text.slice(0, 400));
  }
  return { ok: res.ok, status: res.status, data: json };
}

async function main() {
  console.log("=== 1. Updating App Info Localization (Name, Subtitle, Privacy URL) ===");
  const infoRes = await api("PATCH", `/v1/appInfoLocalizations/${APP_INFO_LOC_ID}`, {
    data: {
      type: "appInfoLocalizations",
      id: APP_INFO_LOC_ID,
      attributes: {
        name: "StreamSnap AI: Shop Streams",
        subtitle: "Shazam for Streams & Videos",
        privacyPolicyUrl: "https://streamsnap.online/privacy.html"
      }
    }
  });
  console.log("AppInfoLocalization status:", infoRes.status);

  console.log("=== 2. Updating App Categories (SHOPPING / UTILITIES) ===");
  const catRes = await api("PATCH", `/v1/appInfos/${APP_INFO_ID}`, {
    data: {
      type: "appInfos",
      id: APP_INFO_ID,
      relationships: {
        primaryCategory: {
          data: { type: "appCategories", id: "SHOPPING" }
        },
        secondaryCategory: {
          data: { type: "appCategories", id: "UTILITIES" }
        }
      }
    }
  });
  console.log("AppCategories status:", catRes.status);

  console.log("=== 3. Updating Age Rating Declaration (4+) ===");
  const ageRel = await api("GET", `/v1/appInfos/${APP_INFO_ID}/ageRatingDeclaration`);
  const ageId = ageRel.data?.data?.id;
  if (ageId) {
    const ageRes = await api("PATCH", `/v1/ageRatingDeclarations/${ageId}`, {
      data: {
        type: "ageRatingDeclarations",
        id: ageId,
        attributes: {
          alcoholTobaccoOrDrugUseOrReferences: "NONE",
          contests: "NONE",
          gambling: false,
          gamblingSimulated: "NONE",
          horrorOrFearThemes: "NONE",
          matureOrSuggestiveThemes: "NONE",
          medicalOrTreatmentInformation: "NONE",
          profanityOrCrudeHumor: "NONE",
          sexualContentGraphicAndNudity: "NONE",
          sexualContentOrNudity: "NONE",
          violenceCartoonOrFantasy: "NONE",
          violenceRealistic: "NONE",
          violenceRealisticProlongedGraphicOrSadistic: "NONE",
          seventeenPlus: false,
          unrestrictedWebAccess: false
        }
      }
    });
    console.log("AgeRatingDeclaration status:", ageRes.status);
  }

  console.log("=== 4. Updating App Store Version (1.0.1, Copyright) ===");
  const verRes = await api("PATCH", `/v1/appStoreVersions/${VERSION_ID}`, {
    data: {
      type: "appStoreVersions",
      id: VERSION_ID,
      attributes: {
        versionString: "1.0.1",
        copyright: "2026 StreamSnap AI",
        releaseType: "AFTER_APPROVAL"
      }
    }
  });
  console.log("AppStoreVersion status:", verRes.status);

  console.log("=== 5. Updating App Store Version Localization (Description, Keywords, URLs) ===");
  const description = `StreamSnap AI is your visual shopping assistant for live streams, social videos, and photos. Think of it as "Shazam for Products"!

Ever watched a Twitch stream, YouTube Live, TikTok, or Instagram Reel and wondered:
"What microphone is the streamer using?"
"Where can I buy those headphones or that keyboard?"
"What jacket or hoodie is the creator wearing?"

With StreamSnap AI, you can identify gear, electronics, fashion, and accessories in seconds.

KEY FEATURES:
• 1-Click Visual AI Detection: Powered by cutting-edge Gemini Vision AI to recognize products accurately.
• Instant Amazon Matching: Direct, verified product listings and real-time pricing from Amazon.
• Live Background Scan (Broadcast): Sample stream frames in real-time in the background while watching your favorite apps.
• Live Camera & Screenshot Scanning: Point your camera at any screen or import screenshots from your gallery.
• Share Extension Integration: Share any image or video link directly from TikTok, Twitter, or Instagram to StreamSnap.
• 1-Click Amazon Cart: Add items straight to your cart and build your wishlist effortlessly.
• Save & Bookmark: Keep track of discovered gear in your persistent offline catalog.

PRIVACY FIRST:
• Photos and video frames are processed ephemerally in real-time and never permanently stored.
• We do not sell user data to third parties.
• Bank-grade HTTPS/TLS encryption for all network requests.

Affiliate Disclosure: StreamSnap AI is a participant in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites and apps to earn advertising fees by linking to Amazon.`;

  const locRes = await api("PATCH", `/v1/appStoreVersionLocalizations/${VERSION_LOC_ID}`, {
    data: {
      type: "appStoreVersionLocalizations",
      id: VERSION_LOC_ID,
      attributes: {
        description,
        keywords: "streamsnap,shopping,amazon,visual search,camera,live stream,twitch,tiktok,products,price tracker",
        promotionalText: "Instantly identify products in live streams & videos with AI and shop on Amazon in 1 click!",
        supportUrl: "https://streamsnap.online",
        marketingUrl: "https://streamsnap.online"
      }
    }
  });
  console.log("AppStoreVersionLocalization status:", locRes.status);

  console.log("=== 6. Configuring App Store Review Detail ===");
  const existingRev = await api("GET", `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`);
  const reviewAttributes = {
    contactFirstName: "Naor",
    contactLastName: "Yanko",
    contactEmail: "na0ryank0@gmail.com",
    contactPhone: "+972546681224",
    demoAccountRequired: false,
    notes: `StreamSnap AI allows users to visually identify products and stream gear.

Features to test:
1. Camera Scan: Point camera at any gadget, microphone, or fashion item to identify it on Amazon.
2. Photo Library & Paste Link: Pick any screenshot from photo library or paste a video link to find matching products.
3. Live Scan: Uses ReplayKit Broadcast Upload Extension (org.name.StreamSnapAI.BroadcastExtension) to sample frames when the user pauses a video while watching streaming apps.
4. Cart: Add detected items to Amazon cart. External links redirect to official Amazon product pages via Safari.`
  };

  if (existingRev.data?.data?.id) {
    const revPatch = await api("PATCH", `/v1/appStoreReviewDetails/${existingRev.data.data.id}`, {
      data: {
        type: "appStoreReviewDetails",
        id: existingRev.data.data.id,
        attributes: reviewAttributes
      }
    });
    console.log("Updated Review Detail status:", revPatch.status);
  } else {
    const revPost = await api("POST", `/v1/appStoreReviewDetails`, {
      data: {
        type: "appStoreReviewDetails",
        attributes: reviewAttributes,
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: VERSION_ID }
          }
        }
      }
    });
    console.log("Created Review Detail status:", revPost.status);
  }

  console.log("=== 7. Uploading 6.5-inch App Store Screenshots ===");
  const setsRes = await api("GET", `/v1/appStoreVersionLocalizations/${VERSION_LOC_ID}/appScreenshotSets`);
  let setId = (setsRes.data?.data || []).find(s => s.attributes.screenshotDisplayType === "APP_IPHONE_65")?.id;
  if (!setId) {
    const createSet = await api("POST", `/v1/appScreenshotSets`, {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType: "APP_IPHONE_65" },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: VERSION_LOC_ID }
          }
        }
      }
    });
    setId = createSet.data?.data?.id;
  }

  if (setId) {
    const existingShots = await api("GET", `/v1/appScreenshotSets/${setId}/appScreenshots`);
    const existingCount = (existingShots.data?.data || []).length;
    console.log(`Screenshot set ${setId} currently has ${existingCount} screenshots.`);
    if (existingCount === 0) {
      const shotDir = "/Users/naoryanko/Documents/antigravity/excited-hopper/mobile/assets/appstore_screenshots";
      const files = ["screenshot_1_6.5inch.png", "screenshot_2_6.5inch.png", "screenshot_3_6.5inch.png"];
      for (const fileName of files) {
        const filePath = path.join(shotDir, fileName);
        const buf = fs.readFileSync(filePath);
        const md5 = crypto.createHash("md5").update(buf).digest("hex");

        const reserve = await api("POST", `/v1/appScreenshots`, {
          data: {
            type: "appScreenshots",
            attributes: { fileName, fileSize: buf.length },
            relationships: {
              appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } }
            }
          }
        });
        const shotId = reserve.data?.data?.id;
        const ops = reserve.data?.data?.attributes?.uploadOperations || [];
        for (const op of ops) {
          const headers = {};
          for (const h of op.requestHeaders || []) headers[h.name] = h.value;
          const slice = buf.subarray(op.offset, op.offset + op.length);
          await fetch(op.url, { method: op.method, headers, body: slice });
        }
        if (shotId) {
          const commit = await api("PATCH", `/v1/appScreenshots/${shotId}`, {
            data: {
              type: "appScreenshots",
              id: shotId,
              attributes: { uploaded: true, sourceFileChecksum: md5 }
            }
          });
          console.log(`Uploaded ${fileName} -> status ${commit.status}`);
        }
      }
    }
  }

  console.log("=== 8. Creating & Installing IOS_APP_STORE Provisioning Profiles ===");
  const profDirs = [
    path.join(process.env.HOME, "Library/MobileDevice/Provisioning Profiles"),
    path.join(process.env.HOME, "Library/Developer/Xcode/UserData/Provisioning Profiles")
  ];
  for (const d of profDirs) fs.mkdirSync(d, { recursive: true });

  for (const b of BUNDLE_IDS) {
    const profRes = await api("POST", `/v1/profiles`, {
      data: {
        type: "profiles",
        attributes: {
          name: b.name,
          profileType: "IOS_APP_STORE"
        },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: b.id } },
          certificates: { data: [{ type: "certificates", id: DIST_CERT_ID }] }
        }
      }
    });
    const content = profRes.data?.data?.attributes?.profileContent;
    const uuid = profRes.data?.data?.attributes?.uuid;
    if (content && uuid) {
      const bin = Buffer.from(content, "base64");
      for (const d of profDirs) {
        fs.writeFileSync(path.join(d, `${uuid}.mobileprovision`), bin);
      }
      console.log(`✅ Installed IOS_APP_STORE profile for ${b.bundleId} (UUID: ${uuid})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
