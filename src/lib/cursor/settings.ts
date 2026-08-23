import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSecret, setSecret } from "@/lib/settings/secret-store";

export type CursorChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const API_KEY = "snd.cursor.api-key";
const AGENT_ID_KEY = "snd.cursor.agent-id";
const MESSAGES_KEY = "snd.cursor.messages.v1";

export async function loadCursorApiKey(): Promise<string> {
  try {
    return (await getSecret(API_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveCursorApiKey(value: string): Promise<void> {
  await setSecret(API_KEY, value.trim());
}

export async function loadCursorAgentId(): Promise<string> {
  try {
    return (await getSecret(AGENT_ID_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveCursorAgentId(value: string): Promise<void> {
  await setSecret(AGENT_ID_KEY, value.trim());
}

export async function loadCursorMessages(): Promise<CursorChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(MESSAGES_KEY);
    return raw ? (JSON.parse(raw) as CursorChatMessage[]) : [];
  } catch {
    return [];
  }
}

export async function saveCursorMessages(messages: CursorChatMessage[]): Promise<void> {
  await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.slice(-50)));
}

export async function clearCursorMessages(): Promise<void> {
  await AsyncStorage.removeItem(MESSAGES_KEY);
}
