const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

const MARKER = "NLC_HEADLESS_VIDEO_CONTEXT";

function patchExpoVideo(projectRoot) {
  const file = path.join(projectRoot, "node_modules/expo-video/android/src/main/java/expo/modules/video/VideoModule.kt");
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(MARKER)) return;
  const original = "val player = VideoPlayer(appContext.throwingActivity.applicationContext, appContext, source)";
  if (!source.includes(original)) throw new Error("expo-video changed its player constructor; review the Headless JS context patch before building Android.");
  // The player already takes an application Context. Only its views need an Activity.
  const replacement = `// ${MARKER}: HTTP playback can start before any Activity exists.
        val context = (appContext.reactContext ?: throw expo.modules.kotlin.exception.Exceptions.ReactContextLost()).applicationContext
        val player = VideoPlayer(context, appContext, source)`;
  fs.writeFileSync(file, source.replace(original, replacement));
}

module.exports = config => withDangerousMod(config, ["android", config => {
  patchExpoVideo(config.modRequest.projectRoot);
  return config;
}]);
module.exports.patchExpoVideo = patchExpoVideo;
