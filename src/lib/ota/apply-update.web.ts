export type OtaInfo = {
  supported: boolean;
  available: boolean;
  channel: string | null;
};

export async function getOtaInfo(): Promise<OtaInfo> {
  return { supported: false, available: false, channel: null };
}

export async function checkOtaAvailable(): Promise<boolean> {
  return false;
}

export async function applyOtaUpdate(): Promise<boolean> {
  return false;
}

export function isOtaNotification(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;
  const flag = data.ota;
  return flag === true || flag === "true" || flag === "1" || flag === 1;
}

export function isApkNotification(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;
  const flag = data.apk;
  return flag === true || flag === "true" || flag === "1" || flag === 1;
}

export const GITHUB_APK_URL = "https://github.com/JuanCarlosGP/SND/releases/latest/download/SND.apk";
export const GITHUB_RELEASES_URL = "https://github.com/JuanCarlosGP/SND/releases/latest";
