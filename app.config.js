const pkg = require("./package.json");

const EAS_PROJECT_ID = "1015393c-2e99-4548-8336-a256a97dbecc";

export default {
  expo: {
    name: "SND",
    slug: "snd",
    version: pkg.version,
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
    scheme: "snd",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    android: {
      package: "app.snd.player",
      versionCode: 1,
      softwareKeyboardLayoutMode: "resize",
      usesCleartextTraffic: true,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0E0D0C",
      },
      permissions: [
        "android.permission.INTERNET",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "android.permission.WAKE_LOCK",
        "android.permission.POST_NOTIFICATIONS",
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
    ],
    web: {
      output: "server",
    },
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
  },
};
