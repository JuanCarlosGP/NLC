#!/usr/bin/env bash
# Install a local Android SDK so `npm run apk:check` can compile before EAS.
set -euo pipefail

SDK="${ANDROID_HOME:-$HOME/.local/opt/android-sdk}"
ZIP_URL="https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip"
TMP="$(mktemp -d)"

mkdir -p "$SDK/cmdline-tools"
if [[ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]]; then
  echo "Descargando Android command-line tools…"
  curl -fsSL "$ZIP_URL" -o "$TMP/cmdtools.zip"
  unzip -q "$TMP/cmdtools.zip" -d "$TMP"
  rm -rf "$SDK/cmdline-tools/latest"
  mv "$TMP/cmdline-tools" "$SDK/cmdline-tools/latest"
fi

export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$PATH"

set +o pipefail
yes | sdkmanager --licenses >/dev/null
set -o pipefail
sdkmanager \
  "platform-tools" \
  "platforms;android-35" \
  "build-tools;35.0.0" \
  "ndk;27.1.12297006"

echo "ANDROID_HOME=$SDK"
echo "Listo. En ~/.bashrc: export ANDROID_HOME=$SDK"
rm -rf "$TMP"
