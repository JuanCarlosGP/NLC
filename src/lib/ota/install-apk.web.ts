import { GITHUB_APK_DOWNLOAD } from "@/lib/ota/github-apk";

export async function downloadAndInstallApk(
  _onProgress?: (ratio: number) => void,
): Promise<void> {
  const link = document.createElement("a");
  link.href = GITHUB_APK_DOWNLOAD;
  link.download = "NLC.apk";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
