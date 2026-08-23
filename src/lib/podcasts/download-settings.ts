import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteSecret, getSecret, setSecret } from "@/lib/settings/secret-store";

const SETTINGS_KEY = "nlc.download.settings.v1";
const TOKEN_KEY = "nlc.download.token";

export type DownloadSettings = {
  host: string;
  port: string;
  enabled: boolean;
};

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  host: "192.168.1.106",
  port: "8091",
  enabled: true,
};

export async function loadDownloadSettings(): Promise<DownloadSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_DOWNLOAD_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DownloadSettings>;
    return { ...DEFAULT_DOWNLOAD_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_DOWNLOAD_SETTINGS };
  }
}

export async function saveDownloadSettings(settings: DownloadSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadDownloadToken(): Promise<string> {
  try {
    return (await getSecret(TOKEN_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveDownloadToken(token: string): Promise<void> {
  if (!token) {
    await deleteSecret(TOKEN_KEY);
    return;
  }
  await setSecret(TOKEN_KEY, token);
}

export function downloadBaseUrl(settings: DownloadSettings): string {
  const host = settings.host.trim();
  const port = settings.port.trim();
  return `http://${host}:${port}`;
}
