import { chatController as standalone } from "./controller.local";
import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend, onBackendChange, requestId } from "@/lib/backend/remote";
import type { ChatState } from "./controller-core";
import { createChatController } from "./controller-core";
import type { AppZone } from "@/lib/zone/zone-context";
export const chatClientId = typeof window === "undefined" ? "web" : requestId();
let state: ChatState = { ready: false, configured: false, connected: false, busy: false, messages: [], error: null };
const listeners = new Set<() => void>();
async function call(method: string, args: unknown[] = []) {
 const next = await browserBackend.invoke<ChatState>(`chat.${method}`, [chatClientId, ...args], { domain: "chat", write: !["state", "test"].includes(method), atomic: false }); state = next; listeners.forEach(fn => fn());
}
const remote = { getSnapshot: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, load: () => call("state"), configure: (key: string) => call("configure", [key]), test: async (key?: string) => { await call("test", [key || ""]); return { ok: state.connected, message: state.error || "Conectado" }; }, send: (text: string, zone: AppZone) => call("send", [text, zone]), clear: () => call("clear"), reserve: async () => {}, runReserved: async () => {} };
onBackendChange(domain => { if (remoteEnabled && ["chat", "*"].includes(domain)) void call("state").catch(() => {}); });
// Standalone web preview retains its existing local chat, while the packaged profile always uses the phone.
export const chatController = remoteEnabled ? remote : standalone;
