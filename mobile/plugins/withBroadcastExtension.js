const fs = require("fs");
const path = require("path");
const { withEntitlementsPlist, withInfoPlist, withXcodeProject } = require("@expo/config-plugins");

const EXTENSION_NAME = "BroadcastExtension";
const APP_GROUP = "group.com.streamsnap.ai";

function withBroadcastExtension(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    const groups = cfg.modResults["com.apple.security.application-groups"] || [];
    if (!groups.includes(APP_GROUP)) groups.push(APP_GROUP);
    cfg.modResults["com.apple.security.application-groups"] = groups;
    return cfg;
  });

  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSMicrophoneUsageDescription =
      cfg.modResults.NSMicrophoneUsageDescription ||
      "StreamSnap does not record audio. This is only requested if iOS shows the broadcast microphone toggle.";
    return cfg;
  });

  config = withXcodeProject(config, (cfg) => {
    addBroadcastTarget(cfg.modResults, cfg.modRequest.platformProjectRoot, cfg.ios?.bundleIdentifier);
    return cfg;
  });

  return config;
}

function addBroadcastTarget(project, iosRoot, appBundleId) {
  if (project.pbxTargetByName(EXTENSION_NAME)) return;

  const extensionBundleId = `${appBundleId || "org.name.StreamSnapAI"}.${EXTENSION_NAME}`;
  const target = project.addTarget(EXTENSION_NAME, "app_extension", EXTENSION_NAME, extensionBundleId);
  project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", target.uuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);

  const group = project.pbxCreateGroup(EXTENSION_NAME, EXTENSION_NAME);
  project.addSourceFile(`${EXTENSION_NAME}/SampleHandler.swift`, { target: target.uuid }, group);
  project.addSourceFile(
    "../modules/live-scan/ios/LiveScanStore.swift",
    { target: target.uuid },
    group
  );
  project.addFile(`${EXTENSION_NAME}/Info.plist`, group);
  project.addFramework("ReplayKit.framework", { target: target.uuid });

  const configurations = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configurations)) {
    const settings = configurations[key].buildSettings;
    if (!settings || settings.PRODUCT_NAME !== `"${EXTENSION_NAME}"`) continue;
    settings.CLANG_ENABLE_MODULES = "YES";
    settings.INFOPLIST_FILE = `"${EXTENSION_NAME}/Info.plist"`;
    settings.CODE_SIGN_ENTITLEMENTS = `"${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements"`;
    settings.CODE_SIGN_STYLE = "Automatic";
    settings.GENERATE_INFOPLIST_FILE = "NO";
    settings.PRODUCT_BUNDLE_IDENTIFIER = `"${extensionBundleId}"`;
    settings.SWIFT_VERSION = "5.0";
    settings.TARGETED_DEVICE_FAMILY = `"1"`;
    settings.IPHONEOS_DEPLOYMENT_TARGET = "15.1";
    settings.SKIP_INSTALL = "YES";
  }

  const entitlementsPath = path.join(iosRoot, "StreamSnapAI", "StreamSnapAI.entitlements");
  if (fs.existsSync(entitlementsPath)) {
    const mainConfigs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(mainConfigs)) {
      const settings = mainConfigs[key].buildSettings;
      if (!settings || settings.PRODUCT_NAME !== "StreamSnapAI") continue;
      settings.CODE_SIGN_ENTITLEMENTS = "StreamSnapAI/StreamSnapAI.entitlements";
    }
  }
}

module.exports = withBroadcastExtension;
