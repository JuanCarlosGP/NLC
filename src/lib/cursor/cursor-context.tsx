import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { chatController, chatClientId } from "./controller";
import { useZone } from "@/lib/zone/zone-context";
import { colors } from "@/lib/theme";
import type { CursorChatMessage } from "./settings";
export type { CursorChatMessage };
export type CursorFeedback = { text: string; color: string };
type CursorContextValue = { ready: boolean; apiKey: string; setApiKey(next: string): void; connected: boolean; busy: boolean; feedback: CursorFeedback | null; messages: CursorChatMessage[]; chatOpen: boolean; chatUnread: boolean; setChatOpen(open: boolean): void; persist(): Promise<void>; testConnection(): Promise<void>; send(text: string): Promise<void>; clearHistory(): Promise<void> };
const Context = createContext<CursorContextValue | null>(null);
export function CursorProvider({ children }: { children: ReactNode }) {
 const state = useSyncExternalStore(chatController.subscribe, chatController.getSnapshot, chatController.getSnapshot);
 const { zone, setZone } = useZone(); const [apiKey, setApiKey] = useState(""); const [chatOpen, setChatOpen] = useState(false); const [chatUnread, setUnread] = useState(false); const [feedback, setFeedback] = useState<CursorFeedback | null>(null); const lastIntent = useRef(0);
 useEffect(() => { void chatController.load(); }, []);
 useEffect(() => { if (chatOpen) setUnread(false); else if (state.messages.length) setUnread(true); }, [chatOpen, state.messages.length]);
 useEffect(() => { if (state.intent?.clientId === chatClientId && state.intent.id !== lastIntent.current) { lastIntent.current = state.intent.id; setZone(state.intent.zone); } }, [state.intent, setZone]);
 const value = useMemo<CursorContextValue>(() => ({ ready: state.ready, apiKey, setApiKey, connected: state.connected || state.configured, busy: state.busy, feedback: state.error ? { text: state.error, color: colors.danger } : feedback, messages: state.messages, chatOpen, chatUnread, setChatOpen,
 persist: async () => { await chatController.configure(apiKey); setApiKey(""); setFeedback({ text: "Clave guardada", color: colors.ok }); },
 testConnection: async () => { const result = await chatController.test(apiKey); setFeedback({ text: result.message, color: result.ok ? colors.ok : colors.danger }); },
 send: async text => { try { await chatController.send(text, zone, chatClientId); } catch (error) { setFeedback({ text: String(error), color: colors.danger }); throw error; } }, clearHistory: chatController.clear,
 }), [state, apiKey, feedback, chatOpen, chatUnread, zone]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCursor(): CursorContextValue { const value = useContext(Context); if (!value) throw new Error("CursorProvider missing"); return value; }
