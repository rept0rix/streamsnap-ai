const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

const SERVICE_NAME = "expo.modules.livescan.LiveScanService";
const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
  "android.permission.POST_NOTIFICATIONS"
];

function withAndroidLiveScan(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const androidManifest = manifest.manifest;
    if (!androidManifest) return cfg;

    androidManifest["uses-permission"] = androidManifest["uses-permission"] || [];
    for (const name of PERMISSIONS) {
      const exists = androidManifest["uses-permission"].some(
        (item) => item.$?.["android:name"] === name
      );
      if (!exists) {
        androidManifest["uses-permission"].push({ $: { "android:name": name } });
      }
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service || [];
    const already = app.service.some((svc) => svc.$?.["android:name"] === SERVICE_NAME);
    if (!already) {
      app.service.push({
        $: {
          "android:name": SERVICE_NAME,
          "android:exported": "false",
          "android:foregroundServiceType": "mediaProjection",
          "android:stopWithTask": "false"
        }
      });
    }
    return cfg;
  });
}

module.exports = withAndroidLiveScan;
