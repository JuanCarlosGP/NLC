const pkg = require("./package.json");

export default {
  expo: {
    name: "SND",
    slug: "snd",
    version: pkg.version,
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
      "./plugins/with-lan-cleartext.js",
    ],
    web: {
      output: "server",
    },
    experiments: {
      typedRoutes: true,
    },
    extra: process.env.EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
      : {},
  },
};
