import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteSecret, getSecret, setSecret } from "@/lib/settings/secret-store";

const CLIENT_ID_KEY = "snd.spotify.client-id";
const TOKENS_KEY = "snd.spotify.tokens";

export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export async function loadSpotifyClientId(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(CLIENT_ID_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveSpotifyClientId(clientId: string): Promise<void> {
  const trimmed = clientId.trim();
  if (!trimmed) {
    await AsyncStorage.removeItem(CLIENT_ID_KEY);
    return;
  }
  await AsyncStorage.setItem(CLIENT_ID_KEY, trimmed);
}

export async function loadSpotifyTokens(): Promise<SpotifyTokens | null> {
  try {
    const raw = await getSecret(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as SpotifyTokens) : null;
  } catch {
    return null;
  }
}

export async function saveSpotifyTokens(tokens: SpotifyTokens): Promise<void> {
  await setSecret(TOKENS_KEY, JSON.stringify(tokens));
}

export async function clearSpotifyTokens(): Promise<void> {
  await deleteSecret(TOKENS_KEY);
}
