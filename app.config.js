const pkg = require("./package.json");
const fs = require("fs");
const path = require("path");

const EAS_PROJECT_ID = "eaae8e25-f5ae-48b4-9ca5-1023d77701f7";
const easBuild = process.env.EAS_BUILD === "true";
const googleServices = fs.existsSync(path.join(__dirname, "google-services.json"))
  ? "./google-services.json"
  : undefined;

export default {
  expo: {
    name: "NLC",
    slug: "nlc",
    version: pkg.version,
    // Expo Go speaks exposdk:54.x and loads JS from Metro.
    // EAS APKs use appVersion + u.expo.dev for OTA.
    runtimeVersion: easBuild ? { policy: "appVersion" } : { policy: "sdkVersion" },
    ...(easBuild
      ? {
          updates: {
            url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
            fallbackToCacheTimeout: 0,
            checkAutomatically: "ON_ERROR_RECOVERY",
          },
        }
      : {}),
    scheme: "nlc",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    android: {
      package: "app.nlc.player",
      versionCode: 7,
      softwareKeyboardLayoutMode: "resize",
      usesCleartextTraffic: true,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        monochromeImage: "./assets/monochrome-icon.png",
        backgroundColor: "#F0EBE3",
      },
      ...(googleServices ? { googleServicesFile: googleServices } : {}),
      permissions: [
        "android.permission.INTERNET",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "android.permission.WAKE_LOCK",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.SCHEDULE_EXACT_ALARM",
        "android.permission.REQUEST_INSTALL_PACKAGES",
      ],
      blockedPermissions: ["android.permission.RECORD_AUDIO"],
    },
    plugins: [
      ["expo-router", { root: "./src/app" }],
      "expo-secure-store",
      "expo-web-browser",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#0E0D0C",
          image: "./assets/splash-icon.png",
          imageWidth: 140,
        },
      ],
      [
        "expo-audio",
        {
          microphonePermission: false,
          recordAudioAndroid: false,
        },
      ],
      "./plugins/with-media-skip-buttons.js",
      "expo-video",
      [
        "expo-screen-orientation",
        {
          initialOrientation: "PORTRAIT_UP",
        },
      ],
      "./plugins/with-lan-cleartext.js",
      "expo-sqlite",
      "expo-asset",
      "expo-updates",
      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          color: "#E4D5B8",
          defaultChannel: "ota",
        },
      ],
    ],
    web: {
      // "server" makes GET / HTML; Expo Go then fails to load the native bundle.
      output: easBuild ? "server" : "single",
    },
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID,
      },
      githubReleases: "https://github.com/JuanCarlosGP/NLC/releases/latest",
      githubApk: "https://github.com/JuanCarlosGP/NLC/releases/download/apk/NLC.apk",
    },
  },
};
