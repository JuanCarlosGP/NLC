import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Linking from "expo-linking";
import { GITHUB_APK_DOWNLOAD } from "@/lib/ota/github-apk";

const PACKAGE = "app.nlc.player";

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

  const task = FileSystem.createDownloadResumable(
    GITHUB_APK_DOWNLOAD,
    dest,
    {
      headers: {
        Accept: "*/*",
        "User-Agent": "NLC",
      },
    },
    (progress) => {
      if (progress.totalBytesExpectedToWrite > 0) {
        onProgress?.(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
      }
    },
  );

  const result = await task.downloadAsync();
  if (!result?.uri || result.status < 200 || result.status >= 300) {
    throw new Error(`HTTP ${result?.status ?? 0}`);
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
