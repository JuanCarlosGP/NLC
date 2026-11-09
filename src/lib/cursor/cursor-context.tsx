import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Platform } from "react-native";
import { chatController, chatClientId } from "./controller";
import { saveGitHubIssuesToken } from "./github";
import { useZone } from "@/lib/zone/zone-context";
import { colors } from "@/lib/theme";
import { t } from "@/lib/i18n/runtime";
import type { CursorChatMessage } from "./settings";
import type { AssistantProposal } from "./proposals";
import type { AssistantProvider } from "./providers";

export type { CursorChatMessage };
export type CursorFeedback = { text: string; color: string };
type CursorContextValue = {
  ready: boolean;
  configured: boolean;
  provider: AssistantProvider;
  configuredProviders: AssistantProvider[];
  clearFeedback(): void;
  connected: boolean;
  busy: boolean;
  feedback: CursorFeedback | null;
  proposal?: AssistantProposal;
  proposalError: string | null;
  messages: CursorChatMessage[];
  chatOpen: boolean;
  chatUnread: boolean;
  setChatOpen(open: boolean): void;
  persist(provider: AssistantProvider, key: string, githubToken?: string): Promise<boolean>;
  testConnection(provider: AssistantProvider, key: string): Promise<void>;
  send(text: string): Promise<void>;
  clearHistory(): Promise<void>;
  decide(id: string, accept: boolean): Promise<void>;
};
const Context = createContext<CursorContextValue | null>(null);

export function CursorProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(chatController.subscribe, chatController.getSnapshot, chatController.getSnapshot);
  const { zone, setZone } = useZone();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setUnread] = useState(false);
  const [feedback, setFeedback] = useState<CursorFeedback | null>(null);
  const lastIntent = useRef(0);

  useEffect(() => { void chatController.load().catch(() => {}); }, []);
  useEffect(() => {
    if (chatOpen) setUnread(false);
    else if (state.messages.length || state.proposal) setUnread(true);
  }, [chatOpen, state.messages.length, state.proposal]);
  useEffect(() => {
    if (state.intent?.clientId === chatClientId && state.intent.id !== lastIntent.current) {
      lastIntent.current = state.intent.id;
      setZone(state.intent.zone);
    }
  }, [state.intent, setZone]);

  const value = useMemo<CursorContextValue>(() => ({
    ready: state.ready,
    configured: state.configured,
    provider: state.provider,
    configuredProviders: state.configuredProviders,
    clearFeedback: () => setFeedback(null),
    connected: state.connected || state.configured,
    busy: state.busy,
    feedback: feedback ?? (state.error ? { text: state.error, color: colors.danger } : null),
    proposal: state.proposal,
    proposalError: state.error,
    messages: state.messages,
    chatOpen,
    chatUnread,
    setChatOpen,
    persist: async (provider, key, githubToken) => {
      try {
        if (Platform.OS === "android" && githubToken?.trim()) await saveGitHubIssuesToken(githubToken);
        if (key.trim() || provider !== state.provider) await chatController.configure(provider, key);
        setFeedback({ text: t("chat.keySaved"), color: colors.ok });
        return true;
      } catch (error) {
        setFeedback({ text: error instanceof Error ? error.message : t("chat.saveFail"), color: colors.danger });
        return false;
      }
    },
    testConnection: async (provider, key) => {
      try {
        const result = await chatController.test(provider, key);
        setFeedback({ text: result.message, color: result.ok ? colors.ok : colors.danger });
      } catch (error) {
        setFeedback({ text: error instanceof Error ? error.message : t("chat.talkFail"), color: colors.danger });
      }
    },
    send: async text => {
      try {
        await chatController.send(text, zone, chatClientId);
      } catch (error) {
        setFeedback({ text: String(error), color: colors.danger });
        throw error;
      }
    },
    clearHistory: chatController.clear,
    decide: chatController.decide,
  }), [state, feedback, chatOpen, chatUnread, zone]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCursor(): CursorContextValue {
  const value = useContext(Context);
  if (!value) throw new Error("CursorProvider missing");
  return value;
}
