#!/usr/bin/env bash
# Generate the native Android tree and compile it. Run this before EAS / Release APK.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ ! -d "$ANDROID_HOME/platforms" ]]; then
  echo "No hay Android SDK en $ANDROID_HOME"
  echo "Instálalo con: bash scripts/install-android-sdk.sh"
  exit 1
fi

cd "$root"
export CI=1
npx expo prebuild --platform android --no-install

if ! npx expo-modules-autolinking resolve --platform android 2>/dev/null | grep -q "nlc-lan-bridge"; then
  echo "nlc-lan-bridge is not autolinked. The TUI pair will not work."
  exit 1
fi

cd android
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
