import { GITHUB_APK_DOWNLOAD } from "@/lib/ota/github-apk";

export async function downloadAndInstallApk(
  _onProgress?: (ratio: number) => void,
): Promise<void> {
  window.open(GITHUB_APK_DOWNLOAD, "_blank", "noopener,noreferrer");
}
