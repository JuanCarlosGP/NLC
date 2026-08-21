import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MusicSourceKind } from "@/lib/nas/types";
import { deleteSecret, getSecret, setSecret } from "@/lib/settings/secret-store";

const SETTINGS_KEY = "snd.settings.v1";
const PASSWORD_KEY = "snd.nas.password";

export type NasSettings = {
  sourceKind: MusicSourceKind;
  host: string;
  port: string;
  username: string;
  sharePath: string;
  useHttps: boolean;
  maxBitRate: string;
};

export const DEFAULT_NAS_SETTINGS: NasSettings = {
  sourceKind: "webdav",
  host: "192.168.1.106",
  port: "5005",
  username: "Viewer",
  sharePath: "/Music",
  useHttps: false,
  maxBitRate: "0",
};

export async function loadNasSettings(): Promise<NasSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_NAS_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<NasSettings>;
    return { ...DEFAULT_NAS_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_NAS_SETTINGS };
  }
}

export async function saveNasSettings(settings: NasSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadNasPassword(): Promise<string> {
  try {
    return (await getSecret(PASSWORD_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveNasPassword(password: string): Promise<void> {
  if (!password) {
    await deleteSecret(PASSWORD_KEY);
    return;
  }
  await setSecret(PASSWORD_KEY, password);
}

export function nasBaseUrl(settings: NasSettings): string {
  const scheme = settings.useHttps ? "https" : "http";
  const host = settings.host.trim();
  const port = settings.port.trim();
  return `${scheme}://${host}:${port}`;
}
