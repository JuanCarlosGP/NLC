import { chatController as standalone } from "./controller.local";
import { remoteEnabled, PHONE_ONLY } from "@/lib/backend/profile";
import { browserBackend, onBackendChange, requestId } from "@/lib/backend/remote";
import { t } from "@/lib/i18n/runtime";
import type { ChatState } from "./controller-core";
import type { AssistantProvider } from "./providers";
import type { AppZone } from "@/lib/zone/zone-context";

export const chatClientId = typeof window === "undefined" ? "web" : requestId();
let state: ChatState = {
  provider: "cursor", configuredProviders: [], ready: false, configured: false,
  connected: false, busy: false, messages: [], error: null,
};
const listeners = new Set<() => void>();
type TestResult = { ok: boolean; message: string };
let requestNumber = 0;
let appliedRequest = 0;

async function call(method: "state" | "configure" | "test" | "send" | "clear", args: unknown[] = []) {
  const sequence = ++requestNumber;
  const next = await browserBackend.invoke<ChatState & { testResult?: TestResult }>(
    `chat.${method}`, [chatClientId, ...args],
    { domain: "chat", write: method !== "state" && method !== "test", atomic: false },
  );
  const { testResult, ...snapshot } = next;
  if (sequence > appliedRequest) {
    appliedRequest = sequence;
    state = snapshot;
    listeners.forEach(fn => fn());
  }
  return testResult;
}

const remote = {
  getSnapshot: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  load: async () => { await call("state"); },
  configure: async (provider: AssistantProvider, key = "") => {
    if (key) throw new Error(PHONE_ONLY);
    await call("configure", [provider]);
  },
  test: async (provider: AssistantProvider, key = "") => {
    if (key) throw new Error(PHONE_ONLY);
    return await call("test", [provider]) ?? { ok: false, message: t("chat.talkFail") };
  },
  send: async (text: string, zone: AppZone) => { await call("send", [text, zone]); },
  clear: async () => { await call("clear"); },
  decide: async (_id: string, _accept: boolean) => { throw new Error(PHONE_ONLY); },
};
onBackendChange(domain => {
  if (remoteEnabled && ["chat", "*"].includes(domain)) void call("state").catch(() => {});
});
export const chatController = remoteEnabled ? remote : standalone;
