
module.exports = ({ config }) => ({
  ...config,
  name: "StreamSnap AI",
  slug: "streamsnap-ai",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0B0F17"
  },
  scheme: "streamsnap",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.streamsnap.ai",
    buildNumber: "1",
    infoPlist: {
      NSCameraUsageDescription:
        "StreamSnap uses your camera to scan items in live streams and find them on Amazon.",
      NSPhotoLibraryUsageDescription:
        "StreamSnap reads screenshots from your photo library to identify products.",
      NSPhotoLibraryAddUsageDescription:
        "StreamSnap saves scan results to your photo library.",
      NSMicrophoneUsageDescription:
        "StreamSnap does not record audio. iOS may show this if the broadcast microphone toggle appears."
    },
    entitlements: {
      "com.apple.security.application-groups": ["group.com.streamsnap.ai"]
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0B0F17"
    },
    package: "com.streamsnap.ai",
    versionCode: 1,
    permissions: [
      "CAMERA",
      "READ_EXTERNAL_STORAGE",
      "READ_MEDIA_IMAGES",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_MEDIA_PROJECTION",
      "POST_NOTIFICATIONS"
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "streamsnap"
          }
        ],
        category: ["BROWSABLE", "DEFAULT"]
      }
    ]
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/icon.png"
  },
  plugins: [
    "./plugins/withBroadcastExtension",
    "./plugins/withAndroidLiveScan",
    "expo-router",
    "expo-camera",
    [
      "expo-image-picker",
      {
        photosPermission:
          "StreamSnap reads your photos to identify products from screenshots."
      }
    ],
    [
      "expo-share-intent",
      {
        iosActivationRules: {
          NSExtensionActivationSupportsImageWithMaxCount: 1,
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1
        },
        androidIntentFilters: ["image/*", "text/plain"]
      }
    ]
  ],
  experiments: {
    typedRoutes: true,
    ...(process.env.EXPO_WEB_BASE_URL
      ? { baseUrl: process.env.EXPO_WEB_BASE_URL }
      : {})
  },
  extra: {
    workerUrl: "https://streamsnap-lens.na0ryank0.workers.dev",
    eas: {
      projectId: "0538ed35-21ea-4c96-9755-0cd4bbbbd7f8"
    }
  }
});
