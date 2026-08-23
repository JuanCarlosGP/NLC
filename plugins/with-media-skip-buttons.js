/**
 * Re-applies SND lock-screen next/previous buttons if `npm install` resets expo-audio.
 * Full patch also lives in node_modules/expo-audio (search SND_MEDIA_SKIP).
 */
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const MARKER = "SND_MEDIA_SKIP";

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function write(file, next) {
  const prev = read(file);
  if (prev == null || prev === next) return;
  fs.writeFileSync(file, next);
}

function patched(content) {
  return Boolean(content && content.includes(MARKER));
}

function withMediaSkipButtons(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const root = path.join(modConfig.modRequest.projectRoot, "node_modules/expo-audio");
      const records = path.join(root, "android/src/main/java/expo/modules/audio/AudioRecords.kt");
      let source = read(records);
      if (source && !source.includes("showNextTrack")) {
        write(
          records,
          source.replace(
            `class AudioLockScreenOptions(
  @Field val showSeekForward: Boolean,
  @Field val showSeekBackward: Boolean
) : Record`,
            `class AudioLockScreenOptions(
  @Field val showSeekForward: Boolean = false,
  @Field val showSeekBackward: Boolean = false,
  // ${MARKER}
  @Field val showNextTrack: Boolean = false,
  @Field val showPreviousTrack: Boolean = false
) : Record`,
          ),
        );
      }

      const player = path.join(root, "android/src/main/java/expo/modules/audio/AudioPlayer.kt");
      source = read(player);
      if (source && !patched(source)) {
        source = source.replace(
          `private const val AUDIO_SAMPLE_UPDATE = "audioSampleUpdate"`,
          `private const val AUDIO_SAMPLE_UPDATE = "audioSampleUpdate"\nprivate const val LOCK_SCREEN_SKIP = "lockScreenSkip"`,
        );
        if (!source.includes("emitLockScreenSkip")) {
          source = source.replace(
            `fun clearLockScreenControls() {
    if (isActiveForLockScreen) {
      AudioControlsService.setActivePlayer(context, null)
    }
  }`,
            `fun clearLockScreenControls() {
    if (isActiveForLockScreen) {
      AudioControlsService.setActivePlayer(context, null)
    }
  }

  // ${MARKER}
  fun emitLockScreenSkip(direction: String) {
    emit(LOCK_SCREEN_SKIP, mapOf("direction" to direction))
  }`,
          );
        }
        write(player, source);
      }

      const service = path.join(
        root,
        "android/src/main/java/expo/modules/audio/service/AudioControlsService.kt",
      );
      source = read(service);
      if (source && !patched(source)) {
        console.warn(
          "[with-media-skip-buttons] expo-audio AudioControlsService lost SND_MEDIA_SKIP; restore from git or re-apply the lock-screen patch.",
        );
      }

      const iosRecords = path.join(root, "ios/AudioRecords.swift");
      source = read(iosRecords);
      if (source && !source.includes("showNextTrack")) {
        write(
          iosRecords,
          source.replace(
            `struct LockScreenOptions: Record {
  @Field var showSeekForward: Bool = false
  @Field var showSeekBackward: Bool = false
}`,
            `struct LockScreenOptions: Record {
  @Field var showSeekForward: Bool = false
  @Field var showSeekBackward: Bool = false
  // ${MARKER}
  @Field var showNextTrack: Bool = false
  @Field var showPreviousTrack: Bool = false
}`,
          ),
        );
      }
      return modConfig;
    },
  ]);
}

module.exports = withMediaSkipButtons;
