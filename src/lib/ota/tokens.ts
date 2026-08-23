import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWebDavText, putWebDavText } from "@/lib/nas/webdav-source";
import { joinPath } from "@/lib/nas/webdav";
import type { NasSettings } from "@/lib/settings/storage";

export const PUSH_TOKENS_FILENAME = "snd-push-tokens.json";
const LOCAL_TOKEN_KEY = "snd.ota.push-token";

export type PushTokenRecord = {
  token: string;
  updatedAt: number;
};

export type PushTokenFile = {
  version: 1;
  tokens: PushTokenRecord[];
};

export function pushTokensPath(settings: NasSettings): string {
  return joinPath(settings.sharePath, PUSH_TOKENS_FILENAME);
}

export async function loadLocalPushToken(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(LOCAL_TOKEN_KEY))?.trim() || null;
  } catch {
    return null;
  }
}

export async function saveLocalPushToken(token: string): Promise<void> {
  await AsyncStorage.setItem(LOCAL_TOKEN_KEY, token);
}

function parseTokenFile(raw: string): PushTokenFile {
  try {
    const parsed = JSON.parse(raw) as Partial<PushTokenFile>;
    const tokens = Array.isArray(parsed.tokens)
      ? parsed.tokens.filter((item): item is PushTokenRecord => typeof item?.token === "string")
      : [];
    return { version: 1, tokens };
  } catch {
    return { version: 1, tokens: [] };
  }
}

export async function registerPushTokenOnNas(
  settings: NasSettings,
  password: string,
  token: string,
): Promise<void> {
  if (!token || settings.sourceKind !== "webdav" || !password) return;
  const path = pushTokensPath(settings);
  let file: PushTokenFile = { version: 1, tokens: [] };
  try {
    file = parseTokenFile(await getWebDavText(settings, password, path));
  } catch {
    file = { version: 1, tokens: [] };
  }
  const next: PushTokenFile = {
    version: 1,
    tokens: [{ token, updatedAt: Date.now() }, ...file.tokens.filter((item) => item.token !== token)].slice(
      0,
      20,
    ),
  };
  await putWebDavText(settings, password, path, `${JSON.stringify(next, null, 2)}\n`);
}
