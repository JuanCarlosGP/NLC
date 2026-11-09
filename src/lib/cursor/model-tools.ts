import { t, tr } from "@/lib/i18n/runtime";
import { loadNasPassword, loadNasSettings } from "@/lib/settings/storage.impl";
import { executeAssistantActions, searchAssistantRecords, type AssistantAction, type AssistantRuntime } from "./actions";
import { proposeIssue } from "./github";
import { answerHealthSummary } from "./health-query";
import { proposeVideoToMusic } from "./media-organization";
import type { ProposedAction } from "./proposals";
import { buildAssistantSnapshot } from "./snapshot";
import { answerWealthMonth } from "./wealth-query";

type Field =
  | { type: "string"; maxLength?: number; enum?: string[] }
  | { type: "boolean" }
  | { type: "number" }
  | { type: "array"; items: { type: "string" }; maxItems: number };
type Tool = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, Field>;
    required: string[];
    additionalProperties: false;
  };
};
const text = { type: "string", maxLength: 2000 } as const;
const number = { type: "number" } as const;
const flag = { type: "boolean" } as const;
const tracks = { type: "array", items: { type: "string" }, maxItems: 30 } as const;
const choices = (...values: string[]): Field => ({ type: "string", enum: values });
const tool = (
  name: string, description: string,
  required: Record<string, Field> = {}, optional: Record<string, Field> = {},
): Tool => ({
  name, description,
  parameters: { type: "object", properties: { ...required, ...optional }, required: Object.keys(required), additionalProperties: false },
});

const taskFields = { status: choices("todo", "doing", "done"), project: text, due: text, notes: text, starred: flag };
const reminderFields = { time: text, frequency: choices("once", "daily", "weekdays", "weekly"), weekday: number, due: text, body: text, enabled: flag };
const assetFields = { ticker: text, account: text, quantity: number, price: number, cost_basis: number };
const goalFields = { scope: choices("networth", "cash", "account", "asset"), account: text, asset: text, due: text };

export const MODEL_TOOLS: readonly Tool[] = [
  tool("read_nlc_context", "Read a brief snapshot for the area requested by the user.", { zone: choices("music", "podcast", "video", "focus", "wealth") }),
  tool("search_nlc_records", "Find records and return their labels and exact refs. Use refs for subsequent edits. If several results fit, ask the user before editing.", {
    kind: choices("task", "project", "track", "playlist", "album", "artist", "video", "transaction", "account", "asset", "goal", "reminder"),
    match: text,
  }),
  tool("wealth_month", "Show the locally calculated change in net worth this calendar month."),
  tool("health_month", "Show a local monthly summary for the requested part of Health.", { kind: choices("weight", "nutrition", "training", "medication", "bodyPhotos") }),
  tool("move_audio_to_music", "Find an audio file misplaced in Video. Show matches or prepare a move to Music for confirmation. Omit match when the user gives no title.", {}, { match: { type: "string", maxLength: 300 }, storage: choices("local", "nas") }),
  tool("propose_issue", "Prepare a public issue for a missing NLC feature. Describe the problem and expected behavior in Spanish. Exclude private data and secrets.", { title: { type: "string", maxLength: 100 }, body: { type: "string", maxLength: 3000 } }),
  tool("create_task", "Create a task. Use today, tomorrow, none or YYYY-MM-DD for due.", { title: text }, taskFields),
  tool("update_task", "Edit the task whose title matches match.", { match: text }, { ...taskFields, title: text, append_notes: text }),
  tool("move_task", "Move a task to another status or project.", { match: text }, taskFields),
  tool("delete_task", "Delete a task by title.", { match: text }),
  tool("create_project", "Create a task project.", { name: text }),
  tool("rename_project", "Rename a task project.", { match: text, name: text }),
  tool("archive_project", "Archive a task project.", { match: text }),
  tool("create_reminder", "Create a reminder. Time is HH:MM. Weekday is 1 for Sunday through 7 for Saturday.", { title: text }, reminderFields),
  tool("update_reminder", "Update a reminder by title.", { match: text }, { ...reminderFields, title: text }),
  tool("delete_reminder", "Delete a reminder by title.", { match: text }),
  tool("create_playlist", "Create a playlist and optionally add tracks identified by title and artist.", { name: text }, { tracks }),
  tool("rename_playlist", "Rename a playlist.", { match: text, name: text }),
  tool("delete_playlist", "Delete a playlist.", { match: text }),
  tool("like_playlist", "Toggle or set whether a playlist is shown on Home.", { match: text }, { liked: flag }),
  tool("add_to_playlist", "Add tracks identified by title and artist to an existing playlist.", { playlist: text, tracks }),
  tool("remove_from_playlist", "Remove one track from a playlist, leaving the track in the music library.", { playlist: text, match: text }),
  tool("favorite_track", "Toggle a track favorite.", { match: text }),
  tool("rename_track", "Rename a track.", { match: text, name: text }),
  tool("rename_album", "Rename an album.", { match: text, name: text }),
  tool("rename_artist", "Rename an artist.", { match: text, name: text }),
  tool("rename_video", "Rename a video or series.", { match: text, name: text }),
  tool("favorite_video", "Toggle a video favorite.", { match: text }),
  tool("create_tx", "Log a EUR transaction. A transfer needs counter. A trade needs asset, quantity and price.", { kind: choices("income", "expense", "buy", "sell", "transfer"), title: text }, { amount: number, quantity: number, price: number, category: text, account: text, counter: text, asset: text, ticker: text, asset_kind: text, notes: text, due: text }),
  tool("update_tx", "Edit an existing income or expense, leaving unspecified fields unchanged. Use due for the new booking date.", { match: text }, { title: text, amount: number, account: text, category: text, notes: text, due: text }),
  tool("delete_tx", "Delete a transaction by title.", { match: text }),
  tool("create_account", "Create a wealth account.", { name: text }, { kind: choices("cash", "bank", "wallet") }),
  tool("rename_account", "Rename a wealth account.", { match: text, name: text }),
  tool("archive_account", "Archive a wealth account, or restore with archived=false.", { match: text }, { archived: flag }),
  tool("create_asset", "Create an investment asset.", { name: text }, { ...assetFields, kind: choices("stock", "crypto", "etf", "fund", "portfolio", "other") }),
  tool("update_asset", "Update an investment asset by name or ticker.", { match: text }, { ...assetFields, name: text, archived: flag }),
  tool("archive_asset", "Archive an investment asset.", { match: text }),
  tool("quote_asset", "Record an asset price in EUR on the selected date.", { match: text, price: number }, { due: text }),
  tool("create_goal", "Create a wealth goal.", { name: text, target: number }, goalFields),
  tool("update_goal", "Update a wealth goal.", { match: text }, { ...goalFields, name: text, target: number, archived: flag }),
  tool("archive_goal", "Archive a wealth goal.", { match: text }),
  tool("delete_goal", "Delete a wealth goal.", { match: text }),
  tool("set_zone", "Open an NLC section.", { zone: choices("music", "podcast", "video", "focus", "wealth", "health") }),
];

export type ToolCall = { id: string; name: string; input: unknown };
export type ToolResult = { text: string; output?: string; show?: boolean; terminal?: boolean; proposal?: ProposedAction; modelContext?: boolean; modelText?: string };

function fieldValid(field: Field, value: unknown) {
  if (field.type === "array") return Array.isArray(value) && value.length <= field.maxItems
    && value.every(item => typeof item === "string" && item.length <= 300);
  if (field.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (field.type === "boolean") return typeof value === "boolean";
  return typeof value === "string" && value.length <= (field.maxLength ?? 2000)
    && (!field.enum || field.enum.includes(value));
}

export function validateTool(call: ToolCall): AssistantAction {
  const schema = MODEL_TOOLS.find(tool => tool.name === call.name)?.parameters;
  const input: unknown = typeof call.input === "string" ? JSON.parse(call.input) : call.input;
  if (!schema || !input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_tool_arguments");
  const fields = Object.entries(input);
  if (fields.some(([name, value]) => !Object.prototype.hasOwnProperty.call(schema.properties, name)
      || !fieldValid(schema.properties[name]!, value))
    || schema.required.some(name => !Object.prototype.hasOwnProperty.call(input, name))) {
    throw new Error("invalid_tool_arguments");
  }
  return { op: call.name, ...Object.fromEntries(fields.sort(([a], [b]) => a.localeCompare(b))) };
}

export async function runAssistantTool(action: AssistantAction, setZone: AssistantRuntime["setZone"]): Promise<ToolResult> {
  switch (action.op) {
    case "read_nlc_context":
      return { text: await buildAssistantSnapshot(action.zone as Parameters<typeof buildAssistantSnapshot>[0]) };
    case "search_nlc_records": {
      const [settings, password] = await Promise.all([loadNasSettings(), loadNasPassword()]);
      const result = await searchAssistantRecords(action.kind, action.match ?? "", { settings, password, setZone });
      const labels = result.matches.map(({ label }, index) => `${index + 1}. ${label}`);
      const text = labels.length ? labels.join("\n\n") : tr("I found no matching records.", "No encontré registros que coincidan.");
      const output = JSON.stringify(result);
      const modelText = labels.length ? JSON.stringify(result.matches) : undefined;
      if (result.count > 1) {
        const question = t("cursor.recordAmbiguous", { query: action.match ?? "" });
        return { text: `${question}\n\n${text}`, modelText, terminal: true };
      }
      return { text, output, modelText };
    }
    case "wealth_month":
      return { text: await answerWealthMonth(), terminal: true };
    case "health_month":
      return { text: await answerHealthSummary(action.kind), terminal: true };
    case "move_audio_to_music": {
      const proposal = await proposeVideoToMusic(action.match, action.storage);
      return typeof proposal === "string" ? { text: proposal, terminal: true, modelContext: true } : {
        text: tr("Review the move in NLC on Android.", "Revisa el traslado en NLC para Android."),
        terminal: true, proposal,
      };
    }
    case "propose_issue":
      return {
        text: tr("Review the public issue in NLC on Android.", "Revisa la issue pública en NLC para Android."),
        terminal: true, proposal: proposeIssue(action.title, action.body),
      };
    default: {
      const [settings, password] = await Promise.all([loadNasSettings(), loadNasPassword()]);
      const [result] = await executeAssistantActions([action], { settings, password, setZone });
      return result!.ok
        ? { text: result!.message, output: "Action completed.", show: true }
        : { text: result!.message, terminal: true, modelText: result!.modelText };
    }
  }
}
