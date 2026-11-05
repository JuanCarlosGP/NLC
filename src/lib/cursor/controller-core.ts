import type { CursorChatMessage } from "./settings";
import type { AppZone } from "@/lib/zone/zone-context";
export type ChatState = { ready: boolean; configured: boolean; connected: boolean; busy: boolean; messages: CursorChatMessage[]; error: string | null; intent?: { clientId: string; zone: AppZone; id: number } };
export type ChatDriver = {
 load(): Promise<{ configured: boolean; messages: CursorChatMessage[] }>;
 saveKey(key: string): Promise<void>; test(key?: string): Promise<{ ok: boolean; message: string }>;
 saveMessages(messages: CursorChatMessage[]): Promise<void>; clear(): Promise<void>;
 run(text: string, zone: AppZone, navigate: (zone: AppZone) => boolean): Promise<{ id: string; text: string }>;
};
export function createChatController(driver: ChatDriver) {
 let state: ChatState = { ready: false, configured: false, connected: false, busy: false, messages: [], error: null };
 let loading: Promise<void> | null = null; const listeners = new Set<() => void>();
 const update = (patch: Partial<ChatState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
 const load = () => loading ??= driver.load().then(value => update({ ...value, ready: true })).catch(error => { loading = null; update({ ready: true, error: String(error) }); });
 async function configure(key: string) { await load(); if (key.trim()) { await driver.saveKey(key); update({ configured: true, error: null }); } }
 async function test(key?: string) { const result = await driver.test(key); update({ connected: result.ok, error: result.ok ? null : result.message }); return result; }
 async function reserve(text: string) {
  await load(); if (state.busy) throw new Error("chat_busy"); if (!state.configured) throw new Error("Configura la clave del asistente");
  if (!text.trim() || text.length > 16000) throw new Error("invalid_message");
  update({ busy: true, error: null, messages: [...state.messages, { id: `u-${Date.now()}`, role: "user" as const, text: text.trim() }].slice(-50) });
  try { await driver.saveMessages(state.messages); } catch (error) { update({ busy: false, error: String(error) }); throw error; }
 }
 async function runReserved(text: string, zone: AppZone, clientId: string) {
  try {
   const reply = await driver.run(text, zone, target => { update({ intent: { zone: target, clientId, id: Date.now() } }); return true; });
   const messages = [...state.messages, { id: reply.id, role: "assistant" as const, text: reply.text }].slice(-50); await driver.saveMessages(messages); update({ messages, connected: true });
  } catch (error) {
   const message = error instanceof Error ? error.message : "No se pudo enviar";
   const messages = [...state.messages, { id: `e-${Date.now()}`, role: "assistant" as const, text: message }].slice(-50);
   await driver.saveMessages(messages).catch(() => {}); update({ messages, error: message });
  } finally { update({ busy: false }); }
 }
 async function send(text: string, zone: AppZone, clientId: string) { await reserve(text); await runReserved(text, zone, clientId); }
 async function clear() { if (state.busy) throw new Error("chat_busy"); await driver.clear(); update({ messages: [], error: null, intent: undefined }); }
 return { getSnapshot: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, load, configure, test, reserve, runReserved, send, clear };
}
