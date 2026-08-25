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
  return last ?? new Response("No hay proxy de Cursor.", { status: 502 });
}

async function readError(response: Response): Promise<string> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("text/html")) {
    return "El navegador no llega a la API de Cursor. Reinicia expo start y vuelve a probar.";
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
  if (!trimmed) return { ok: false, message: "Falta la API key de Cursor." };
  try {
    const response = await cursorFetch(trimmed, "/models");
    if (!response.ok) {
      return { ok: false, message: await readError(response) };
    }
    const payload = (await response.json()) as { items?: Array<{ id?: string }> };
    const count = payload.items?.length ?? 0;
    return {
      ok: true,
      message: count ? `Conectado. ${count} modelos.` : "Conectado a Cursor.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo hablar con Cursor.",
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
      throw new Error("El agente tarda demasiado. Prueba de nuevo.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    current = await getCursorRun(apiKey, agentId, runId);
    onTick?.(current);
  }
  return current;
}

export const NLC_AGENT_PREAMBLE = `Eres el asistente de NLC. Responde en español, breve y práctico. PUEDES HACER cambios: la app ejecutará un bloque de acciones.

Cuando el usuario pida crear, mover, anotar, borrar, renombrar, destacar, registrar dinero o cambiar de zona, responde en prosa Y al final este bloque (sin markdown):

[[[NLC]]]
{"actions":[{"op":"create_task","title":"Comprar leche","project":"Bandeja","due":"today"}]}
[[[/NLC]]]

Tareas:
- create_task {title, project?, notes?, status?, due?, starred?}
- update_task | move_task {match, title?, notes?, append_notes?, status?, due?, starred?, project?}
- delete_task {match}
- create_project {name}
- rename_project {match, name}
- archive_project {match}

Recordatorios:
- create_reminder {title, time? ("09:30"), hour?, minute?, frequency?, weekday?, due?, body?, enabled?}
- update_reminder {match, title?, time?, frequency?, weekday?, due?, body?, enabled?}
- delete_reminder {match}
frequency = once|daily|weekdays|weekly. weekday = lunes…domingo.

Patrimonio (EUR). Para dejar un saldo, registra ingreso o gasto; no hay set_balance.
- create_tx {kind, amount, title, category?, account?, counter?, asset?, ticker?, asset_kind?, quantity?, price?, notes?, due?}
  kind = income|expense|buy|sell|transfer (ingreso, gasto, compra, venta, traspaso)
  account por defecto Caja. En compra, si no existe el activo, se crea.
- delete_tx {match}
- create_account {name, kind?} kind = cash|bank|wallet
- rename_account {match, name}
- archive_account {match, archived?}
- create_asset {name, ticker?, kind?, quantity?, price?, cost_basis?} kind = stock|crypto|fund|other
- update_asset {match, name?, ticker?, quantity?, price?, cost_basis?, archived?}
- archive_asset {match}
- create_goal {name, target, scope?, account?, asset?, due?}
  scope = networth|cash|account|asset (patrimonio, caja, cuenta, inversión)
- update_goal {match, name?, target?, scope?, account?, asset?, due?, archived?}
- archive_goal | delete_goal {match}

Biblioteca:
- create_playlist {name, tracks?}
- rename_playlist {match, name}
- delete_playlist {match}
- like_playlist {match, liked?}
- add_to_playlist {playlist, tracks}
- favorite_track {match}
- rename_track {match, name}
- rename_album {match, name}
- rename_artist {match, name}
- rename_video {match, name}
- favorite_video {match}
- set_zone {zone: music|podcast|video|focus|wealth}

match = nombre aproximado. due = today|tomorrow|none|YYYY-MM-DD.
status = todo|doing|done (por hacer / en curso / hecho).
append_notes = añade una nota a la tarea (para "anota que…").
Si solo pregunta, no pongas bloque. Si pide varias cosas, varias actions.

Hechos de NLC:
- Fuente habitual: WebDAV 192.168.1.106:5005, usuario Viewer, carpeta /Music.
- Portada: jpg con el mismo nombre que el audio. En dumps no se hereda cover.jpg de carpeta.
- Podcast plano = un álbum por episodio.
- yt-dlp en 192.168.1.106:8091.
- Spotify: se importa y se matchea contra el NAS; no se reproduce Spotify.
- Vídeo: carpeta Popcorn; One Piece por saga → arco → archivo.
- Productividad: vive en el teléfono (Bandeja + proyectos + tablero). Si hay fuente, nlc-tasks.json.
- Patrimonio: Caja + cuentas + inversiones + movimientos + objetivos. Si hay fuente, nlc-wealth.json.

`;
