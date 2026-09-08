/**
 * Copies FGS dataSync + camera-related uses into the app manifest.
 */
const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  "android.permission.ACCESS_NETWORK_STATE",
];

function withLanBridge(config) {
  config = withAndroidManifest(config, (modConfig) => {
    for (const permission of PERMISSIONS) {
      AndroidConfig.Permissions.ensurePermission(modConfig.modResults, permission);
    }
    return modConfig;
  });
  return config;
}

module.exports = withLanBridge;
