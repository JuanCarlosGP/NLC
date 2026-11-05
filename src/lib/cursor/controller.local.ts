import { createChatController } from "./controller-core";
import { loadCursorApiKey, saveCursorApiKey, loadCursorAgentId, saveCursorAgentId, loadCursorMessages, saveCursorMessages, clearCursorMessages } from "./settings";
import { testCursorKey, nlcAgentPreamble, createCursorAgent, createCursorRun, waitForCursorRun, isTerminalRun } from "./api";
import { executeAssistantActions, extractAssistantActions, inferLocalActions } from "./actions";
import { buildAssistantSnapshot } from "./snapshot";
import { loadNasSettings, loadNasPassword } from "@/lib/settings/storage.impl";
import { t } from "@/lib/i18n/runtime";
import { publishWebEvent } from "@/lib/backend/native-module";
export const chatController = createChatController({
 load: async () => ({ configured: !!await loadCursorApiKey(), messages: await loadCursorMessages() }),
 saveKey: saveCursorApiKey, test: async key => testCursorKey(key?.trim() || await loadCursorApiKey()), saveMessages: saveCursorMessages,
 clear: async () => { await clearCursorMessages(); await saveCursorAgentId(""); },
 run: async (text, zone, setZone) => {
  const key = await loadCursorApiKey(); const snapshot = await buildAssistantSnapshot(zone).catch(() => t("chat.noSnapshot"));
  const prompt = `${nlcAgentPreamble()}\n\n${t("chat.promptState")}\n${snapshot}\n\n${t("chat.promptUser")}\n${text}`;
  let agent = await loadCursorAgentId(), runId: string;
  if (!agent) { const created = await createCursorAgent(key, prompt); agent = created.agent.id; runId = created.run.id; await saveCursorAgentId(agent); }
  else runId = (await createCursorRun(key, agent, prompt)).id;
  const done = await waitForCursorRun(key, agent, runId);
  const raw = done.result?.trim() || (isTerminalRun(done.status) && done.status !== "FINISHED" ? t("chat.agentStatusEnd", { status: done.status }) : t("chat.agentNoReply"));
  const parsed = extractAssistantActions(raw), actions = parsed.actions.length ? parsed.actions : inferLocalActions(text);
  const results = actions.length ? await executeAssistantActions(actions, { settings: await loadNasSettings(), password: await loadNasPassword(), setZone }) : [];
  return { id: done.id, text: [parsed.visible, ...results.map(item => item.message)].filter(Boolean).join("\n\n").trim() || t("chat.agentDone") };
 },
});
chatController.subscribe(() => publishWebEvent({ type: "change", domain: "chat" }));
export const chatClientId = "phone";
