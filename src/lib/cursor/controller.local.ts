import { createChatController } from "./controller-core";
import {
  loadAssistantKey, loadAssistantProviders, saveAssistantProvider, loadCursorAgentId, saveCursorAgentId,
  loadCursorMessages, saveCursorMessages, clearCursorMessages,
} from "./settings";
import { testCursorKey, nlcAgentPreamble, createCursorAgent, createCursorRun, waitForCursorRun } from "./api";
import { executeAssistantActions, extractAssistantActions } from "./actions";
import { buildAssistantSnapshot } from "./snapshot";
import { answerWealthMonth } from "./wealth-query";
import { runAssistantTool } from "./model-tools";
import { runModel } from "./model-run";
import { testModel } from "./model-api";
import { loadNasSettings, loadNasPassword } from "@/lib/settings/storage.impl";
import { t } from "@/lib/i18n/runtime";
import { publishWebEvent } from "@/lib/backend/native-module";

export const chatController = createChatController({
  load: async () => ({ ...await loadAssistantProviders(), messages: await loadCursorMessages() }),
  configure: async (provider, key) => {
    if (!key && !await loadAssistantKey(provider)) throw new Error(t("chat.providerMissingKey"));
    return saveAssistantProvider(provider, key);
  },
  test: async (provider, draftKey) => {
    const key = draftKey || await loadAssistantKey(provider);
    if (provider !== "cursor") return testModel(provider, key);
    const result = await testCursorKey(key);
    return key ? { ...result, message: result.message.replaceAll(key, "[redacted]") } : result;
  },
  saveMessages: saveCursorMessages,
  clear: async () => {
    await clearCursorMessages();
    await saveCursorAgentId("");
  },
  run: async (provider, text, zone, setZone, history) => {
    const request = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/^(?:oye[, ]+)?(?:[¿? ]*)cuanto (?:ha |se ha )?(?:cambiado|subido|aumentado|incrementado|bajado|disminuido) mi patrimonio este mes[?!. ]*$/.test(request)
        || /^how much (?:has )?(?:my )?net worth (?:changed|increased|decreased|gone up|gone down) this month[?!. ]*$/.test(request)) {
      return { id: `wealth-${Date.now()}`, text: await answerWealthMonth() };
    }
    const key = await loadAssistantKey(provider);
    if (!key) throw new Error(t("chat.providerMissingKey"));
    if (provider !== "cursor") {
      const result = await runModel(provider, key, history, zone, setZone);
      return { ...result, id: `${provider}-${Date.now()}` };
    }

    const privateRequest = /\b(issue|github|reporta|reporte|reportar|feature|incidencia|funcionalidad)\b/.test(request);
    const scope = privateRequest ? null
      : /\b(patrimonio|net worth|inversion|wealth)\b/.test(request) ? "wealth"
      : /\b(salud|peso|nutricion|health|entrenamientos|medicacion|suplementos)\b/.test(request) ? "health"
      : /\b(cancion|pista|musica|song|music|playlist|album)\b/.test(request) ? "music"
      : /\b(podcast|podcasts)\b/.test(request) ? "podcast"
      : /\b(video|pelicula|movie)\b/.test(request) ? "video"
      : /\b(tarea|tareas|task|tasks|proyecto|recordatorio)\b/.test(request) ? "focus"
      : zone === "wealth" ? null : zone;
    const snapshot = scope ? await buildAssistantSnapshot(scope).catch(() => t("chat.noSnapshot")) : "";
    const previous = history.at(-2);
    const prompt = [
      nlcAgentPreamble(),
      snapshot ? `${t("chat.promptState")}\n${snapshot}` : "",
      !privateRequest && previous?.role === "assistant" ? `${t("cursor.previousReply")}\n${previous.content}` : "",
      `${t("chat.promptUser")}\n${text}`,
    ].filter(Boolean).join("\n\n");

    let agent = await loadCursorAgentId();
    let runId: string;
    if (!agent) {
      const created = await createCursorAgent(key, prompt);
      agent = created.agent.id;
      runId = created.run.id;
      await saveCursorAgentId(agent);
    } else {
      runId = (await createCursorRun(key, agent, prompt)).id;
    }
    const done = await waitForCursorRun(key, agent, runId);
    if (done.status !== "FINISHED") return { id: done.id, text: t("chat.agentStatusEnd", { status: done.status }) };
    if (!done.result?.trim()) return { id: done.id, text: t("chat.agentNoReply") };

    const parsed = extractAssistantActions(done.result);
    const tool = parsed.actions.find(action => [
      "search_nlc_records", "wealth_month", "health_month", "inspect_video_audio", "move_audio_to_music", "propose_issue",
    ].includes(action.op));
    if (tool) {
      const { text, proposal, modelContext, modelText } = await runAssistantTool(tool, setZone);
      return { id: done.id, text, proposal, modelContext, modelText };
    }

    const actions = parsed.actions;
    const results = actions.length ? await executeAssistantActions(actions, {
      settings: await loadNasSettings(),
      password: await loadNasPassword(),
      setZone,
    }) : [];
    return {
      id: done.id,
      modelText: results.at(-1)?.modelText,
      modelContext: !actions.length && Boolean(parsed.visible),
      text: (actions.length ? results.map(item => item.message).join("\n\n") : parsed.visible) || t("chat.agentDone"),
    };
  },
});

chatController.subscribe(() => publishWebEvent({ type: "change", domain: "chat" }));
export const chatClientId = "phone";
