import type { CursorChatMessage } from "./settings";
import type { AssistantProposal, ProposedAction } from "./proposals";
import type { AppZone } from "@/lib/zone/zone-context";
import { t, tr } from "@/lib/i18n/runtime";
import { isAssistantProvider, normalizeApiKey, type AssistantProvider } from "./providers";
import type { ModelMessage } from "./model-api";

type ProviderState = { provider: AssistantProvider; configuredProviders: AssistantProvider[] };

export type ChatState = ProviderState & {
  ready: boolean;
  configured: boolean;
  connected: boolean;
  busy: boolean;
  messages: CursorChatMessage[];
  error: string | null;
  intent?: { clientId: string; zone: AppZone; id: number };
  proposal?: AssistantProposal;
};
export type ChatDriver = {
  load(): Promise<ProviderState & { messages: CursorChatMessage[] }>;
  configure(provider: AssistantProvider, key: string): Promise<ProviderState>;
  test(provider: AssistantProvider, key: string): Promise<{ ok: boolean; message: string }>;
  saveMessages(messages: CursorChatMessage[]): Promise<void>;
  clear(): Promise<void>;
  run(
    provider: AssistantProvider,
    text: string,
    zone: AppZone,
    navigate: (zone: AppZone) => boolean,
    history: ModelMessage[],
  ): Promise<{
    id: string;
    text: string;
    proposal?: ProposedAction;
    modelContext?: boolean;
    modelText?: string;
  }>;
};

export function createChatController(driver: ChatDriver) {
  let state: ChatState = { provider: "cursor", configuredProviders: [], ready: false, configured: false, connected: false, busy: false, messages: [], error: null };
  let loading: Promise<void> | null = null;
  let configuring = false;
  let pendingAction: ProposedAction | undefined;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<ChatState>) => {
    state = { ...state, ...patch };
    listeners.forEach(fn => fn());
  };
  const load = () => loading ??= driver.load().then(value => update({
    ...value, configured: value.configuredProviders.includes(value.provider), ready: true,
  })).catch(error => {
    loading = null;
    update({ ready: true, error: String(error) });
  });

  async function addMessage(message: CursorChatMessage) {
    const messages = [...state.messages, message].slice(-50);
    await driver.saveMessages(messages);
    update({ messages });
  }

  async function configure(provider: unknown, key: unknown = "") {
    await load();
    if (state.busy || configuring) throw new Error("chat_busy");
    if (!isAssistantProvider(provider)) throw new Error("invalid_assistant_provider");
    configuring = true;
    try {
      const value = await driver.configure(provider, normalizeApiKey(key));
      update({ ...value, configured: value.configuredProviders.includes(provider), connected: false, error: null });
    } finally {
      configuring = false;
    }
  }

  async function test(provider: unknown, key: unknown = "") {
    if (!isAssistantProvider(provider)) throw new Error("invalid_assistant_provider");
    const result = await driver.test(provider, normalizeApiKey(key));
    if (state.provider === provider && !key && !state.busy) {
      update({ connected: result.ok, error: result.ok ? null : result.message });
    }
    return result;
  }

  async function reserve(text: string) {
    await load();
    if (state.busy || configuring) throw new Error("chat_busy");
    if (!state.configured) throw new Error(tr("Set up the assistant key.", "Configura la clave del asistente."));
    if (typeof text !== "string" || !text.trim() || text.length > 16000) throw new Error("invalid_message");
    const provider = state.provider;
    update({ busy: true, error: null });
    try {
      await addMessage({ id: `u-${Date.now()}`, role: "user", text: text.trim(), provider, modelContext: true });
      return provider;
    } catch (error) {
      update({ busy: false, error: String(error) });
      throw error;
    }
  }

  async function runReserved(text: string, zone: AppZone, clientId: string, requestedProvider?: unknown) {
    await load();
    const provider = isAssistantProvider(requestedProvider) ? requestedProvider : state.provider;
    try {
      const history = state.messages.slice(0, -1)
        .filter(message => message.provider === provider && (message.modelContext || message.modelText))
        .slice(-8)
        .map(message => ({ role: message.role, content: (message.modelText ?? message.text).slice(0, 4000) }));
      history.push({ role: "user", content: text });
      const reply = await driver.run(provider, text, zone, target => {
        update({ intent: { zone: target, clientId, id: Date.now() } });
        return true;
      }, history);
      await addMessage({ id: reply.id, role: "assistant", text: reply.text, provider, modelContext: reply.modelContext, modelText: reply.modelText });
      if (reply.proposal) {
        const { kind, title, body } = reply.proposal;
        pendingAction = reply.proposal;
        update({ proposal: { id: reply.id, kind, title, body } });
      }
      if (state.provider === provider) update({ connected: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : tr("Could not send.", "No se pudo enviar.");
      await addMessage({ id: `e-${Date.now()}`, role: "assistant", text: message }).catch(() => {});
      update({ error: message });
    } finally {
      update({ busy: false });
    }
  }

  async function decide(id: string, accept: boolean) {
    if (state.busy || !pendingAction || state.proposal?.id !== id) return;
    if (!accept) {
      pendingAction = undefined;
      update({ proposal: undefined, error: null });
      return;
    }
    const action = pendingAction;
    update({ busy: true, error: null });
    try {
      const text = await action.execute();
      pendingAction = undefined;
      update({ proposal: undefined });
      await addMessage({ id: `a-${Date.now()}`, role: "assistant", text });
    } catch (error) {
      update({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      update({ busy: false });
    }
  }

  async function send(text: string, zone: AppZone, clientId: string) {
    const provider = await reserve(text);
    await runReserved(text, zone, clientId, provider);
  }

  function cancelReserved() {
    update({ busy: false, error: t("chat.talkFail") });
  }

  async function clear() {
    if (state.busy) throw new Error("chat_busy");
    await driver.clear();
    pendingAction = undefined;
    update({ messages: [], error: null, intent: undefined, proposal: undefined });
  }

  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    load, configure, test, reserve, cancelReserved, runReserved, send, clear, decide,
  };
}
