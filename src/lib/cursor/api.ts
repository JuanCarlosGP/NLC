import { t } from "@/lib/i18n/runtime";
import { Platform } from "react-native";

const CURSOR_API = "https://api.cursor.com/v1";

export type CursorRunStatus =
  | "CREATING"
  | "RUNNING"
  | "FINISHED"
  | "ERROR"
  | "CANCELLED"
  | "EXPIRED";

export type CursorRun = {
  id: string;
  agentId: string;
  status: CursorRunStatus;
  result?: string | null;
};

export type CursorAgent = {
  id: string;
  name?: string;
  status?: string;
  latestRunId?: string;
};

const WEB_CURSOR = ["/api/spotify-embed", "/api/nas-files", "/api/cursor"];

function isHtml404(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return response.status === 404 && (type.includes("text/html") || type.includes("text/plain"));
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    "Content-Type": "application/json",
  };
}

function nativeUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${CURSOR_API}${clean}`;
}

async function cursorFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = {
    ...authHeaders(apiKey),
    ...(init.headers as Record<string, string> | undefined),
  };
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (Platform.OS !== "web") {
    return fetch(nativeUrl(clean), { ...init, headers });
  }

  let last: Response | null = null;
  for (const base of WEB_CURSOR) {
    const response = await fetch(`${base}?p=${encodeURIComponent(clean)}`, { ...init, headers });
    if (isHtml404(response)) {
      last = response;
      continue;
    }
    return response;
  }
  return last ?? new Response(t("chat.noProxy"), { status: 502 });
}

async function readError(response: Response): Promise<string> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("text/html")) {
    return t("chat.browserApi");
  }
  try {
    const data = (await response.json()) as { error?: string; message?: string; detail?: string };
    return data.message || data.error || data.detail || `Error ${response.status}`;
  } catch {
    return `Cursor API HTTP ${response.status}`;
  }
}

export async function testCursorKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = apiKey.trim();
  if (!trimmed) return { ok: false, message: t("chat.missingKey") };
  try {
    const response = await cursorFetch(trimmed, "/models");
    if (!response.ok) {
      return { ok: false, message: await readError(response) };
    }
    const payload = (await response.json()) as { items?: Array<{ id?: string }> };
    const count = payload.items?.length ?? 0;
    return {
      ok: true,
      message: count ? t("chat.connectedModels", { count }) : t("chat.connected"),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : t("chat.talkFail"),
    };
  }
}

export async function createCursorAgent(
  apiKey: string,
  text: string,
): Promise<{ agent: CursorAgent; run: CursorRun }> {
  const response = await cursorFetch(apiKey, "/agents", {
    method: "POST",
    body: JSON.stringify({
      name: "NLC",
      prompt: { text },
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { agent: CursorAgent; run: CursorRun };
}

export async function createCursorRun(
  apiKey: string,
  agentId: string,
  text: string,
): Promise<CursorRun> {
  const response = await cursorFetch(apiKey, `/agents/${encodeURIComponent(agentId)}/runs`, {
    method: "POST",
    body: JSON.stringify({ prompt: { text } }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { run: CursorRun };
  return payload.run;
}

export async function getCursorRun(
  apiKey: string,
  agentId: string,
  runId: string,
): Promise<CursorRun> {
  const response = await cursorFetch(
    apiKey,
    `/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
  );
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as CursorRun;
}

export function isTerminalRun(status: string | undefined): boolean {
  return status === "FINISHED" || status === "ERROR" || status === "CANCELLED" || status === "EXPIRED";
}

export async function waitForCursorRun(
  apiKey: string,
  agentId: string,
  runId: string,
  onTick?: (run: CursorRun) => void,
): Promise<CursorRun> {
  const started = Date.now();
  let current = await getCursorRun(apiKey, agentId, runId);
  onTick?.(current);
  while (!isTerminalRun(current.status)) {
    if (Date.now() - started > 4 * 60 * 1000) {
      throw new Error(t("chat.agentSlow"));
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    current = await getCursorRun(apiKey, agentId, runId);
    onTick?.(current);
  }
  return current;
}

export function nlcAgentPreamble(): string {
  return `${t("chat.agentLead")}

${t("chat.agentSpec")}
`;
}
