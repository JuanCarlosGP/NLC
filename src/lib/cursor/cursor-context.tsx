import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { colors } from "@/lib/theme";
import { t } from "@/lib/i18n/runtime";
import {
  nlcAgentPreamble,
  createCursorAgent,
  createCursorRun,
  isTerminalRun,
  testCursorKey,
  waitForCursorRun,
} from "@/lib/cursor/api";
import { executeAssistantActions, extractAssistantActions, inferLocalActions } from "@/lib/cursor/actions";
import { buildAssistantSnapshot } from "@/lib/cursor/snapshot";
import { useSettings } from "@/lib/settings/settings-context";
import { useZone } from "@/lib/zone/zone-context";
import {
  loadCursorAgentId,
  loadCursorApiKey,
  clearCursorMessages,
  loadCursorMessages,
  saveCursorAgentId,
  saveCursorApiKey,
  saveCursorMessages,
  type CursorChatMessage,
} from "@/lib/cursor/settings";

export type { CursorChatMessage };

export type CursorFeedback = {
  text: string;
  color: string;
};

type CursorContextValue = {
  ready: boolean;
  apiKey: string;
  setApiKey: (next: string) => void;
  connected: boolean;
  busy: boolean;
  feedback: CursorFeedback | null;
  messages: CursorChatMessage[];
  chatOpen: boolean;
  chatUnread: boolean;
  setChatOpen: (open: boolean) => void;
  persist: () => Promise<void>;
  testConnection: () => Promise<void>;
  send: (text: string) => Promise<void>;
  clearHistory: () => Promise<void>;
};

const CursorContext = createContext<CursorContextValue | null>(null);

export function CursorProvider({ children }: { children: ReactNode }) {
  const { settings, password } = useSettings();
  const { zone, setZone } = useZone();
  const [ready, setReady] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [agentId, setAgentId] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<CursorFeedback | null>(null);
  const [messages, setMessages] = useState<CursorChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);
  const chatOpenRef = useRef(false);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setChatUnread(false);
  }, [chatOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [storedKey, storedAgent, storedMessages] = await Promise.all([
        loadCursorApiKey(),
        loadCursorAgentId(),
        loadCursorMessages(),
      ]);
      if (cancelled) return;
      setApiKey(storedKey);
      setAgentId(storedAgent);
      setMessages(storedMessages);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await saveCursorApiKey(apiKey);
      setFeedback({ text: t("chat.keySaved"), color: colors.ok });
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : t("chat.saveFail"),
        color: colors.danger,
      });
    } finally {
      setBusy(false);
    }
  }, [apiKey]);

  const testConnection = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await testCursorKey(apiKey);
      setConnected(result.ok);
      setFeedback({ text: result.message, color: result.ok ? colors.ok : colors.danger });
    } finally {
      setBusy(false);
    }
  }, [apiKey]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      if (!apiKey.trim()) {
        setFeedback({ text: t("chat.needKey"), color: colors.danger });
        return;
      }

      const userMessage: CursorChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text,
      };
      setMessages((current) => {
        const next = [...current, userMessage];
        void saveCursorMessages(next);
        return next;
      });
      setBusy(true);
      setFeedback(null);

      try {
        const snapshot = await buildAssistantSnapshot(zone).catch(() => t("chat.noSnapshot"));
        const prompt = `${nlcAgentPreamble()}\n\n${t("chat.promptState")}\n${snapshot}\n\n${t("chat.promptUser")}\n${text}`;
        let nextAgent = agentId;
        let runId = "";
        if (!nextAgent) {
          const created = await createCursorAgent(apiKey, prompt);
          nextAgent = created.agent.id;
          runId = created.run.id;
          setAgentId(nextAgent);
          await saveCursorAgentId(nextAgent);
        } else {
          const run = await createCursorRun(apiKey, nextAgent, prompt);
          runId = run.id;
        }

        const done = await waitForCursorRun(apiKey, nextAgent, runId);
        const raw =
          done.result?.trim() ||
          (isTerminalRun(done.status) && done.status !== "FINISHED"
            ? t("chat.agentStatusEnd", { status: done.status })
            : t("chat.agentNoReply"));
        const parsed = extractAssistantActions(raw);
        const actions = parsed.actions.length ? parsed.actions : inferLocalActions(text);
        const results = actions.length
          ? await executeAssistantActions(actions, { settings, password, setZone })
          : [];
        const visible = parsed.visible;
        const doneLines = results.filter((item) => item.ok).map((item) => item.message);
        const failLines = results.filter((item) => !item.ok).map((item) => item.message);
        const reply = [visible, doneLines.length ? doneLines.join(" ") : "", failLines.length ? failLines.join(" ") : ""]
          .filter(Boolean)
          .join("\n\n")
          .trim() || t("chat.agentDone");
        setMessages((current) => {
          const next = [...current, { id: done.id, role: "assistant" as const, text: reply }];
          void saveCursorMessages(next);
          return next;
        });
        if (!chatOpenRef.current) setChatUnread(true);
        setConnected(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : t("chat.talkFail");
        setFeedback({ text: message, color: colors.danger });
        setMessages((current) => {
          const next = [...current, { id: `e-${Date.now()}`, role: "assistant" as const, text: message }];
          void saveCursorMessages(next);
          return next;
        });
        if (!chatOpenRef.current) setChatUnread(true);
      } finally {
        setBusy(false);
      }
    },
    [agentId, apiKey, password, setZone, settings, zone],
  );

  const clearHistory = useCallback(async () => {
    setMessages([]);
    setAgentId("");
    setFeedback(null);
    await Promise.all([clearCursorMessages(), saveCursorAgentId("")]);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      apiKey,
      setApiKey,
      connected,
      busy,
      feedback,
      messages,
      chatOpen,
      chatUnread,
      setChatOpen,
      persist,
      testConnection,
      send,
      clearHistory,
    }),
    [apiKey, busy, chatOpen, chatUnread, clearHistory, connected, feedback, messages, persist, ready, send, testConnection],
  );

  return <CursorContext.Provider value={value}>{children}</CursorContext.Provider>;
}

export function useCursor(): CursorContextValue {
  const ctx = useContext(CursorContext);
  if (!ctx) throw new Error("useCursor must be used within CursorProvider");
  return ctx;
}
