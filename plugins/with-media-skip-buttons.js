/**
 * Re-applies NLC lock-screen skip buttons if `npm install` resets expo-audio.
 * Canonical native sources live in plugins/media-skip/ (copied at prebuild).
 */
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const MARKER = "NLC_MEDIA_SKIP";
const LEGACY_MARKER = "SND_MEDIA_SKIP";

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function write(file, next) {
  const prev = read(file);
  if (prev == null || prev === next) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
}

function patched(content) {
  return Boolean(content && (content.includes(MARKER) || content.includes(LEGACY_MARKER)));
}

function copyPatchedKotlin(root, filename) {
  const src = path.join(__dirname, "media-skip", filename);
  const dest = path.join(
    root,
    "android/src/main/java/expo/modules/audio/service",
    filename,
  );
  const next = read(src);
  if (!next) {
    console.warn(`[with-media-skip-buttons] missing ${src}`);
    return;
  }
  write(dest, next);
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

      copyPatchedKotlin(root, "AudioControlsService.kt");
      copyPatchedKotlin(root, "AudioMediaSessionCallback.kt");
      copyPatchedKotlin(root, "LockScreenPlayer.kt");

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
