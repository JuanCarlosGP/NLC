export const ASSISTANT_PROVIDERS = {
  cursor: { label: "Cursor", model: "" },
  grok: { label: "Grok", model: "grok-4.7" },
  gemini: { label: "Gemini", model: "gemini-3.8-flash" },
  openai: { label: "OpenAI", model: "gpt-5.4-mini" },
  claude: { label: "Claude", model: "claude-sonnet-4-6" },
  minimax: { label: "MiniMax", model: "MiniMax-M3.1-Flash" },
} as const;

export type AssistantProvider = keyof typeof ASSISTANT_PROVIDERS;
export const PROVIDER_IDS = Object.keys(ASSISTANT_PROVIDERS) as AssistantProvider[];

export function isAssistantProvider(value: unknown): value is AssistantProvider {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ASSISTANT_PROVIDERS, value);
}

export function normalizeApiKey(key: unknown): string {
  if (typeof key !== "string") throw new Error("invalid_assistant_key");
  const value = key.trim();
  if (value.length > 4096 || /[^\x21-\x7e]/.test(value)) throw new Error("invalid_assistant_key");
  return value;
}
