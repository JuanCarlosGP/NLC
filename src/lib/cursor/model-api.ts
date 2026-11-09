import { t } from "@/lib/i18n/runtime";
import { ASSISTANT_PROVIDERS, type AssistantProvider } from "./providers";
import { MODEL_TOOLS, type ToolCall } from "./model-tools";

type ModelProvider = Exclude<AssistantProvider, "cursor">;
export type ModelMessage = { role: "user" | "assistant"; content: string };
type ModelTurn = { text: string; calls: ToolCall[]; appendResults(outputs: string[]): void };
type JsonObject = Record<string, unknown>;

const record = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const rows = (value: unknown) => Array.isArray(value) ? value.map(record) : [];
const string = (value: unknown) => typeof value === "string" ? value : "";

const endpoints: Record<ModelProvider, string> = {
  grok: "https://api.x.ai/v1/responses",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  openai: "https://api.openai.com/v1/responses",
  claude: "https://api.anthropic.com/v1/messages",
  minimax: "https://api.minimax.io/anthropic/v1/messages",
};

function invalidResponse(provider: ModelProvider) {
  return new Error(t("chat.providerResponseError", { provider: ASSISTANT_PROVIDERS[provider].label }));
}

async function request(provider: ModelProvider, key: string, body: JsonObject) {
  const { label, model } = ASSISTANT_PROVIDERS[provider];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const auth: Record<string, string> = provider === "claude"
      ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${key}` };
    let response: Response;
    try {
      response = await fetch(endpoints[provider], {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model }),
        signal: controller.signal,
      });
    } catch {
      throw new Error(t(controller.signal.aborted ? "chat.providerTimeout" : "chat.providerNetworkError", { provider: label }));
    }
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403 ? "chat.providerAuthError"
        : response.status === 402 || response.status === 429 ? "chat.providerQuotaError" : "chat.providerHttpError";
      throw new Error(t(message, { provider: label, status: response.status, model }));
    }
    try {
      return record(await response.json());
    } catch {
      throw invalidResponse(provider);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function modelSession(
  provider: ModelProvider,
  key: string,
  system: string,
  messages: ModelMessage[],
  withTools = true,
): () => Promise<ModelTurn> {
  const history: JsonObject[] = [...messages];
  const tools = withTools ? MODEL_TOOLS : [];
  function checkCalls(calls: ToolCall[]) {
    if (calls.some(call => !call.id || !call.name) || new Set(calls.map(call => call.id)).size !== calls.length) {
      throw invalidResponse(provider);
    }
    return calls;
  }

  if (provider === "openai" || provider === "grok") {
    const input: JsonObject[] = [{ role: "system", content: system }, ...history];
    return async () => {
      const data = await request(provider, key, {
        input,
        store: false,
        max_output_tokens: 4096,
        ...(provider === "grok" ? { reasoning: { effort: "low" } } : { include: ["reasoning.encrypted_content"] }),
        ...(tools.length ? {
          tools: tools.map(definition => ({
            type: "function", ...definition,
            ...(provider === "openai" ? { strict: false } : {}),
          })),
        } : {}),
      });
      if (data.status && data.status !== "completed") throw invalidResponse(provider);
      const output = rows(data.output);
      const calls = checkCalls(output.filter(item => item.type === "function_call").map(item => ({
        id: string(item.call_id), name: string(item.name), input: item.arguments,
      })));
      const content = output.filter(item => item.type === "message").flatMap(item => rows(item.content));
      const text = content.map(part => part.type === "output_text" ? string(part.text)
        : part.type === "refusal" ? string(part.refusal) : "").join("\n");
      return {
        text,
        calls,
        appendResults: results => {
          const replay = provider === "openai" ? output.map(({ created_by: _createdBy, ...item }) => item) : output;
          input.push(...replay, ...calls.map((call, index) => ({
            type: "function_call_output", call_id: call.id, output: results[index],
          })));
        },
      };
    };
  }

  if (provider === "claude" || provider === "minimax") {
    return async () => {
      const data = await request(provider, key, {
        system,
        messages: history,
        max_tokens: 4096,
        ...(provider === "minimax" ? { output_config: { effort: "low" } } : {}),
        ...(tools.length ? { tools: tools.map(({ name, description, parameters }) => ({ name, description, input_schema: parameters })) } : {}),
      });
      if (data.stop_reason === "max_tokens") throw invalidResponse(provider);
      const blocks = rows(data.content);
      const calls = checkCalls(blocks.filter(block => block.type === "tool_use").map(block => ({
        id: string(block.id), name: string(block.name), input: block.input,
      })));
      return {
        text: blocks.filter(block => block.type === "text").map(block => string(block.text)).join("\n"),
        calls,
        appendResults: results => {
          history.push(
            { role: "assistant", content: blocks },
            { role: "user", content: calls.map((call, index) => ({
              type: "tool_result", tool_use_id: call.id, content: results[index],
            })) },
          );
        },
      };
    };
  }

  const input: JsonObject[] = [{ role: "system", content: system }, ...history];
  return async () => {
    const data = await request(provider, key, {
      messages: input,
      max_completion_tokens: 4096,
      reasoning_effort: "low",
      ...(tools.length ? { tools: tools.map(definition => ({ type: "function", function: definition })) } : {}),
    });
    const choice = rows(data.choices)[0];
    if (!choice || choice.finish_reason === "length") throw invalidResponse(provider);
    const message = record(choice.message);
    const calls = checkCalls(rows(message.tool_calls).map(call => ({
      id: string(call.id), name: string(record(call.function).name), input: record(call.function).arguments,
    })));
    return {
      text: string(message.content) || string(message.refusal),
      calls,
      appendResults: results => {
        // Gemini includes thought signatures in the original tool calls.
        input.push(message, ...calls.map((call, index) => ({
          role: "tool", tool_call_id: call.id, content: results[index],
        })));
      },
    };
  };
}

export async function testModel(provider: ModelProvider, key: string) {
  if (!key) return { ok: false, message: t("chat.providerMissingKey") };
  try {
    const next = modelSession(provider, key, "Reply briefly.", [{ role: "user", content: "Reply OK." }], false);
    if (!(await next()).text.trim()) throw invalidResponse(provider);
    return { ok: true, message: t("chat.providerConnected", { provider: ASSISTANT_PROVIDERS[provider].label }) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : t("chat.talkFail") };
  }
}
