import { Platform } from "react-native";
import * as Updates from "expo-updates";

export type OtaInfo = {
  supported: boolean;
  available: boolean;
  channel: string | null;
};

export async function getOtaInfo(): Promise<OtaInfo> {
  if (Platform.OS === "web" || !Updates.isEnabled) {
    return { supported: false, available: false, channel: null };
  }
  try {
    const check = await Updates.checkForUpdateAsync();
    return {
      supported: true,
      available: check.isAvailable,
      channel: Updates.channel ?? null,
    };
  } catch {
    return {
      supported: true,
      available: false,
      channel: Updates.channel ?? null,
    };
  }
}

export async function checkOtaAvailable(): Promise<boolean> {
  return (await getOtaInfo()).available;
}

export async function applyOtaUpdate(): Promise<boolean> {
  if (Platform.OS === "web" || !Updates.isEnabled) return false;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) return false;
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
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
