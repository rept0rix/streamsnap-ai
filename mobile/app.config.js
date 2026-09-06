
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
    permissions: ["CAMERA", "READ_EXTERNAL_STORAGE", "READ_MEDIA_IMAGES"],
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
    bundler: "metro"
  },
  plugins: [
    "./plugins/withBroadcastExtension",
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
    typedRoutes: true
  },
  extra: {
    workerUrl: "https://streamsnap-lens.na0ryank0.workers.dev"
  }
});
