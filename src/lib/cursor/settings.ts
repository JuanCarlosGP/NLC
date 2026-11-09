import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSecret, setSecret } from "@/lib/settings/secret-store";
import { isAssistantProvider, PROVIDER_IDS, type AssistantProvider } from "./providers";

export type CursorChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  provider?: AssistantProvider;
  modelContext?: boolean;
  modelText?: string;
};

const AGENT_ID_KEY = "nlc.cursor.agent-id";
const MESSAGES_KEY = "nlc.cursor.messages.v1";
const PROVIDER_KEY = "nlc.assistant.provider.v1";

function apiKeyStorage(provider: AssistantProvider) {
  return provider === "cursor" ? "nlc.cursor.api-key" : `nlc.assistant.api-key.${provider}`;
}

export async function loadAssistantKey(provider: AssistantProvider): Promise<string> {
  return await getSecret(apiKeyStorage(provider)) ?? "";
}

export async function loadAssistantProviders() {
  const [saved, ...keys] = await Promise.all([
    AsyncStorage.getItem(PROVIDER_KEY),
    ...PROVIDER_IDS.map(loadAssistantKey),
  ]);
  return {
    provider: isAssistantProvider(saved) ? saved : "cursor" as const,
    configuredProviders: PROVIDER_IDS.filter((_id, index) => Boolean(keys[index])),
  };
}

export async function saveAssistantProvider(provider: AssistantProvider, key: string) {
  if (key && key !== await loadAssistantKey(provider)) {
    await setSecret(apiKeyStorage(provider), key);
    if (provider === "cursor") await saveCursorAgentId("");
  }
  await AsyncStorage.setItem(PROVIDER_KEY, provider);
  return loadAssistantProviders();
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
