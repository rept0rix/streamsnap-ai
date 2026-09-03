const fs = require("fs");
const path = require("path");

const iosRoot = path.join(__dirname, "..", "ios");
const pbxPath = path.join(iosRoot, "StreamSnapAI.xcodeproj", "project.pbxproj");
const xcode = require(path.join(__dirname, "..", "node_modules", "xcode"));

const EXTENSION_NAME = "BroadcastExtension";
const EXTENSION_BUNDLE_ID = "org.name.StreamSnapAI.BroadcastExtension";

const project = xcode.project(pbxPath);
project.parseSync();

if (project.pbxTargetByName(EXTENSION_NAME)) {
  console.log("BroadcastExtension target already exists");
} else {
  const target = project.addTarget(
    EXTENSION_NAME,
    "app_extension",
    EXTENSION_NAME,
    EXTENSION_BUNDLE_ID
  );
  project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", target.uuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);

  const group = project.pbxCreateGroup(EXTENSION_NAME, EXTENSION_NAME);
  project.addSourceFile(`${EXTENSION_NAME}/SampleHandler.swift`, { target: target.uuid }, group);
  project.addSourceFile(`${EXTENSION_NAME}/LiveScanStore.swift`, { target: target.uuid }, group);
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
    settings.DEVELOPMENT_TEAM = "CM9QNMLQMQ";
    settings.GENERATE_INFOPLIST_FILE = "NO";
    settings.PRODUCT_BUNDLE_IDENTIFIER = `"${EXTENSION_BUNDLE_ID}"`;
    settings.SWIFT_VERSION = "5.0";
    settings.TARGETED_DEVICE_FAMILY = `"1"`;
    settings.IPHONEOS_DEPLOYMENT_TARGET = "15.1";
    settings.SKIP_INSTALL = "YES";
    settings.LD_RUNPATH_SEARCH_PATHS =
      '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
  }
  console.log("Added BroadcastExtension target");
}

const mainConfigs = project.pbxXCBuildConfigurationSection();
for (const key of Object.keys(mainConfigs)) {
  const settings = mainConfigs[key].buildSettings;
  if (!settings) continue;
  if (settings.PRODUCT_NAME === "StreamSnapAI" || settings.PRODUCT_NAME === '"StreamSnapAI"') {
    settings.CODE_SIGN_ENTITLEMENTS = "StreamSnapAI/StreamSnapAI.entitlements";
  }
}

fs.writeFileSync(pbxPath, project.writeSync());
console.log("Wrote", pbxPath);
