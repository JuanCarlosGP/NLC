import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Linking from "expo-linking";
import { GITHUB_APK_DOWNLOAD } from "@/lib/ota/github-apk";

const PACKAGE = "app.nlc.player";
const DOWNLOAD_HEADERS = {
  Accept: "*/*",
  "User-Agent": "NLC",
};

async function resolveApkUrl(): Promise<string> {
  try {
    const response = await fetch(GITHUB_APK_DOWNLOAD, {
      method: "HEAD",
      headers: DOWNLOAD_HEADERS,
    });
    if (response.ok && response.url) return response.url;
  } catch {
    // Fall back to the GitHub asset URL.
  }
  return GITHUB_APK_DOWNLOAD;
}

export async function downloadAndInstallApk(
  onProgress?: (ratio: number) => void,
): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL(GITHUB_APK_DOWNLOAD);
    return;
  }

  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    await Linking.openURL(GITHUB_APK_DOWNLOAD);
    return;
  }

  const dest = `${dir}NLC.apk`;
  const previous = await FileSystem.getInfoAsync(dest);
  if (previous.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
  }

  const url = await resolveApkUrl();
  const task = FileSystem.createDownloadResumable(
    url,
    dest,
    { headers: DOWNLOAD_HEADERS },
    (progress) => {
      if (progress.totalBytesExpectedToWrite > 0) {
        onProgress?.(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
      }
    },
  );

  const result = await task.downloadAsync();
  if (!result?.uri || result.status < 200 || result.status >= 300) {
    await Linking.openURL(GITHUB_APK_DOWNLOAD);
    return;
  }

  onProgress?.(1);
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: 1,
      type: "application/vnd.android.package-archive",
    });
  } catch {
    try {
      await IntentLauncher.startActivityAsync("android.settings.MANAGE_UNKNOWN_APP_SOURCES", {
        data: `package:${PACKAGE}`,
      });
    } catch {
      await Linking.openURL(GITHUB_APK_DOWNLOAD);
    }
  }
}
