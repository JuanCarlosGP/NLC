import {
  getAlbums,
  getArtists,
  getTracks,
  renameAlbumName,
  renameArtistName,
  renameTrackTitle,
  retargetCatalogPath,
} from "@/lib/db/catalog";
import { loadFavorites, toggleFavorite } from "@/lib/library/cache";
import { moveWebDavPath } from "@/lib/nas/webdav-source";
import { sidecarCoverPath } from "@/lib/nas/webdav";
import type { NasSettings } from "@/lib/settings/storage";
import {
  addTracksToImportedPlaylist,
  createEmptyImportedPlaylist,
  loadImportedPlaylists,
  removeImportedPlaylist,
  renameImportedPlaylist,
  toggleImportedPlaylistLiked,
} from "@/lib/spotify/playlist-store";
import {
  archiveProject,
  createProject,
  createTask,
  deleteTask,
  listProjects,
  listTasks,
  renameProject,
  updateTask,
} from "@/lib/productivity/store";
import { dueToday, dueTomorrow, startOfDay } from "@/lib/productivity/dates";
import { INBOX_PROJECT_ID, type TaskStatus } from "@/lib/productivity/types";
import { notifyAssistantMutations } from "@/lib/cursor/assistant-bus";
import { loadVideoFavorites, toggleVideoFavorite, type VideoFavorite } from "@/lib/video/favorites";
import { listVideoShows } from "@/lib/video/catalog";
import type { AppZone } from "@/lib/zone/zone-context";
import {
  archiveAccount,
  createAccount,
  createAsset,
  createGoal,
  createQuote,
  createTx,
  deleteGoal,
  deleteTx,
  listAccounts,
  listAssets,
  listGoals,
  listTx,
  renameAccount,
  updateAsset,
  updateGoal,
} from "@/lib/wealth/store";
import { parseAmount, roundTo } from "@/lib/wealth/money";
import {
  CASH_ACCOUNT_ID,
  parseGoalScope,
  type WealthAccountKind,
  type WealthAssetKind,
  type WealthTxKind,
} from "@/lib/wealth/types";
import {
  createReminder,
  deleteReminder,
  listReminders,
  updateReminder,
} from "@/lib/reminders/store";
import type { ReminderFrequency } from "@/lib/reminders/types";
import { t } from "@/lib/i18n/runtime";

export type AssistantAction = {
  op: string;
  match?: string;
  title?: string;
  name?: string;
  notes?: string;
  append_notes?: string;
  project?: string;
  playlist?: string;
  tracks?: string[];
  status?: string;
  due?: string | null;
  starred?: boolean;
  liked?: boolean;
  zone?: string;
  kind?: string;
  amount?: number | string;
  quantity?: number | string;
  price?: number | string;
  cost_basis?: number | string;
  ticker?: string;
  account?: string;
  asset?: string;
  counter?: string;
  category?: string;
  body?: string;
  hour?: number | string;
  minute?: number | string;
  time?: string;
  frequency?: string;
  weekday?: number | string;
  enabled?: boolean;
  archived?: boolean;
  asset_kind?: string;
  target?: number | string;
  scope?: string;
};

export type AssistantRuntime = {
  settings: NasSettings;
  password: string;
  setZone: (zone: AppZone) => boolean;
};

export type ActionResult = { ok: boolean; message: string };

const ACTION_BLOCK = /\[\[\[(?:NLC|SND)\]\]\]([\s\S]*?)\[\[\[\/(?:NLC|SND)\]\]\]/g;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function bestMatch<T>(items: T[], nameOf: (item: T) => string, query: string): T | null {
  const q = normalize(query);
  if (!q || !items.length) return null;
  const exact = items.find((item) => normalize(nameOf(item)) === q);
  if (exact) return exact;
  const scored = items
    .map((item) => {
      const name = normalize(nameOf(item));
      let score = 0;
      if (name.includes(q) || q.includes(name)) score += 4;
      const tokens = q.split(/\s+/).filter(Boolean);
      if (tokens.every((token) => name.includes(token))) score += 3;
      if (name.startsWith(q) || q.startsWith(name)) score += 2;
      return { item, score, len: name.length };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.len - b.len);
  return scored[0]?.item ?? null;
}

function parseDue(raw: string | null | undefined): number | null | undefined {
  if (raw == null) return undefined;
  const value = raw.trim().toLowerCase();
  if (!value || value === "none" || value === "sin fecha") return null;
  if (value === "today" || value === "hoy") return dueToday();
  if (value === "tomorrow" || value === "manana" || value === "mañana") return dueTomorrow();
  const iso = Date.parse(raw);
  if (Number.isNaN(iso)) return undefined;
  return startOfDay(iso);
}

function parseStatus(raw: string | undefined): TaskStatus | undefined {
  if (!raw) return undefined;
  const value = normalize(raw);
  if (value === "todo" || value === "por hacer" || value === "pendiente") return "todo";
  if (value === "doing" || value === "en curso" || value === "haciendo") return "doing";
  if (value === "done" || value === "hecho" || value === "hecha" || value === "completada") return "done";
  return undefined;
}

function parseZone(raw: string | undefined): AppZone | null {
  const value = normalize(raw ?? "");
  if (value === "music" || value === "musica") return "music";
  if (value === "podcast" || value === "podcasts") return "podcast";
  if (value === "video" || value === "video") return "video";
  if (value === "focus" || value === "productividad" || value === "tareas") return "focus";
  if (value === "wealth" || value === "finanzas" || value === "patrimonio" || value === "dinero") return "wealth";
  return null;
}

function parseMoney(raw: number | string | undefined, decimals = 2): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return roundTo(raw, decimals);
  if (typeof raw === "string") return parseAmount(raw, decimals) ?? undefined;
  return undefined;
}

function parseTxKind(raw: string | undefined): WealthTxKind | undefined {
  const value = normalize(raw ?? "");
  if (value === "income" || value === "ingreso" || value === "cobro" || value === "nomina") return "income";
  if (value === "expense" || value === "gasto" || value === "pago") return "expense";
  if (value === "buy" || value === "compra" || value === "comprar") return "buy";
  if (value === "sell" || value === "venta" || value === "vender") return "sell";
  if (value === "transfer" || value === "traspaso" || value === "transferencia") return "transfer";
  return undefined;
}

function parseAccountKind(raw: string | undefined): WealthAccountKind | undefined {
  const value = normalize(raw ?? "");
  if (value === "cash" || value === "efectivo" || value === "caja") return "cash";
  if (value === "bank" || value === "banco" || value === "cuenta") return "bank";
  if (value === "wallet" || value === "monedero" || value === "cartera") return "wallet";
  return undefined;
}

function parseAssetKind(raw: string | undefined): WealthAssetKind | undefined {
  const value = normalize(raw ?? "");
  if (value === "stock" || value === "accion" || value === "acciones") return "stock";
  if (value === "crypto" || value === "cripto" || value === "criptomoneda") return "crypto";
  if (value === "etf" || value === "etfs") return "etf";
  if (value === "fund" || value === "fondo") return "fund";
  if (
    value === "portfolio" ||
    value === "cartera" ||
    value === "cartera automatica" ||
    value === "robo" ||
    value === "pasiva"
  ) {
    return "portfolio";
  }
  if (value === "other" || value === "otro") return "other";
  return undefined;
}

function parseFrequency(raw: string | undefined): ReminderFrequency | undefined {
  const value = normalize(raw ?? "");
  if (value === "once" || value === "una vez" || value === "puntual") return "once";
  if (value === "daily" || value === "cada dia" || value === "diario") return "daily";
  if (value === "weekdays" || value === "laborables" || value === "lunes a viernes") return "weekdays";
  if (value === "weekly" || value === "cada semana" || value === "semanal") return "weekly";
  return undefined;
}

function parseWeekday(raw: number | string | undefined): number | undefined {
  if (typeof raw === "number" && raw >= 1 && raw <= 7) return Math.round(raw);
  const value = normalize(String(raw ?? ""));
  if (value === "domingo" || value === "d") return 1;
  if (value === "lunes" || value === "l") return 2;
  if (value === "martes" || value === "m") return 3;
  if (value === "miercoles" || value === "x") return 4;
  if (value === "jueves" || value === "j") return 5;
  if (value === "viernes" || value === "v") return 6;
  if (value === "sabado" || value === "s") return 7;
  const n = Number(value);
  if (n >= 1 && n <= 7) return n;
  return undefined;
}

function parseClock(
  action: Pick<AssistantAction, "hour" | "minute" | "time">,
): { hour: number; minute: number } | undefined {
  const fromTime = String(action.time ?? "").trim().match(/^(\d{1,2})[:h](\d{2})$/i);
  if (fromTime) {
    return { hour: Number(fromTime[1]), minute: Number(fromTime[2]) };
  }
  const hour = typeof action.hour === "number" ? action.hour : action.hour != null ? Number(action.hour) : undefined;
  const minute =
    typeof action.minute === "number" ? action.minute : action.minute != null ? Number(action.minute) : undefined;
  if (hour == null || !Number.isFinite(hour)) return undefined;
  return { hour, minute: Number.isFinite(minute) ? (minute as number) : 0 };
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function dirname(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
}

function withNewName(path: string, name: string): string {
  const parent = dirname(path);
  const current = basename(path);
  const ext = current.includes(".") ? current.slice(current.lastIndexOf(".")) : "";
  const clean = name.trim().replace(/[\\/:*?"<>|]/g, "-");
  const next = ext && !clean.endsWith(ext) ? `${clean}${ext}` : clean;
  return parent === "/" ? `/${next}` : `${parent}/${next}`;
}

async function tryMove(
  settings: NasSettings,
  password: string,
  from: string,
  to: string,
): Promise<string | null> {
  if (!from.startsWith("/") || from === to) return null;
  try {
    await moveWebDavPath(settings, password, from, to);
    if (/\.(mp3|flac|m4a|aac|wav|ogg|opus)$/i.test(from)) {
      const jpgFrom = sidecarCoverPath(from);
      const jpgTo = sidecarCoverPath(to);
      await moveWebDavPath(settings, password, jpgFrom, jpgTo).catch(() => {});
    }
    await retargetCatalogPath(from, to);
    return to;
  } catch {
    return null;
  }
}

export function inferLocalActions(text: string): AssistantAction[] {
  const raw = text.trim();
  const money = raw.match(
    /^(?:apunta|anota|registra)\s+(?:un\s+)?(gasto|ingreso|cobro)\s+de\s+([\d.,]+)\s*(?:€|eur)?(?:\s+(?:en|de|por)\s+(.+?))?\.?$/i,
  );
  if (money) {
    const kind = parseTxKind(money[1]);
    const amount = parseMoney(money[2]);
    const title = money[3]?.trim() || (kind === "income" ? "Ingreso" : "Gasto");
    if (kind && amount != null) return [{ op: "create_tx", kind, amount, title }];
  }
  const buy = raw.match(
    /^(?:compré|compra|apunta(?:\s+una)?\s+compra)\s+(?:(\d+[.,]?\d*)\s+(?:de\s+)?)?(.+?)\s+(?:a|por)\s+([\d.,]+)\s*(?:€|eur)?\.?$/i,
  );
  if (buy) {
    const quantity = buy[1] ? parseMoney(buy[1], 8) : 1;
    const price = parseMoney(buy[3]);
    const name = buy[2]?.trim();
    if (name && price != null && quantity != null) {
      return [{
        op: "create_tx",
        kind: "buy",
        title: name,
        asset: name,
        quantity,
        price,
        amount: quantity * price,
      }];
    }
  }
  const reminder = raw.match(
    /^(?:recuérdame|recuerdame|crea(?:r)?\s+(?:un\s+)?recordatorio)\s+(.+?)(?:\s+a\s+las\s+(\d{1,2})(?::(\d{2}))?)?\.?$/i,
  );
  if (reminder) {
    return [{
      op: "create_reminder",
      title: reminder[1]?.trim(),
      hour: reminder[2],
      minute: reminder[3] ?? "0",
      frequency: "daily",
    }];
  }
  const create = raw.match(/^(?:crea(?:r)?|apunta|anota|añade|agrega)\s+(?:la\s+)?tarea\s+«?(.+?)»?(?:\s+en\s+(.+?))?(?:\s+para\s+(hoy|mañana|tomorrow))?\.?$/i);
  if (create) {
    return [{
      op: "create_task",
      title: create[1]?.trim(),
      project: create[2]?.trim(),
      due: create[3] ? create[3].toLowerCase() : undefined,
    }];
  }
  const move = raw.match(/^(?:pasa|mueve|marca)\s+«?(.+?)»?\s+a\s+(por hacer|en curso|hecho|todo|doing|done)\.?$/i);
  if (move) {
    return [{ op: "move_task", match: move[1]?.trim(), status: move[2] }];
  }
  const note = raw.match(/^(?:anota|apunta|añade(?:le)?(?:\s+una)?\s+nota)\s+(?:en|a)\s+«?(.+?)»?\s*[:—-]\s*(.+)$/i);
  if (note) {
    return [{ op: "update_task", match: note[1]?.trim(), append_notes: note[2]?.trim() }];
  }
  const rename = raw.match(
    /^renombra(?:r)?\s+(?:la\s+|el\s+)?(tarea|proyecto|playlist|canci[oó]n|pista|álbum|album|artista|v[ií]deo|serie)?\s*«?(.+?)»?\s+a\s+«?(.+?)»?\.?$/i,
  );
  if (rename) {
    const kind = normalize(rename[1] ?? "cancion");
    const match = rename[2]?.trim();
    const name = rename[3]?.trim();
    if (kind === "tarea") return [{ op: "update_task", match, title: name }];
    if (kind === "proyecto") return [{ op: "rename_project", match, name }];
    if (kind === "playlist") return [{ op: "rename_playlist", match, name }];
    if (kind === "album" || kind === "álbum") return [{ op: "rename_album", match, name }];
    if (kind === "artista") return [{ op: "rename_artist", match, name }];
    if (kind === "video" || kind === "serie") return [{ op: "rename_video", match, name }];
    return [{ op: "rename_track", match, name }];
  }
  return [];
}

export function extractAssistantActions(reply: string): { actions: AssistantAction[]; visible: string } {
  const actions: AssistantAction[] = [];
  let visible = reply;
  for (const match of reply.matchAll(ACTION_BLOCK)) {
    visible = visible.replace(match[0], "");
    try {
      const parsed = JSON.parse(match[1] ?? "") as { actions?: AssistantAction[] } | AssistantAction[];
      const list = Array.isArray(parsed) ? parsed : parsed.actions;
      if (Array.isArray(list)) actions.push(...list.filter((item) => item && typeof item.op === "string"));
    } catch {
      // ignore malformed blocks
    }
  }
  visible = visible.replace(/```(?:json|nlc|snd)?\s*\{[\s\S]*?"actions"[\s\S]*?\}\s*```/gi, (block) => {
    try {
      const json = block.replace(/```(?:json|nlc|snd)?/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(json) as { actions?: AssistantAction[] };
      if (Array.isArray(parsed.actions)) actions.push(...parsed.actions);
    } catch {
      return block;
    }
    return "";
  });
  return { actions, visible: visible.trim() };
}

export async function executeAssistantActions(
  actions: AssistantAction[],
  runtime: AssistantRuntime,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const action of actions) {
    try {
      results.push(await runAction(action, runtime));
    } catch (error) {
      results.push({
        ok: false,
        message: error instanceof Error ? error.message : t("cursor.actionFailed", { op: action.op }),
      });
    }
  }
  if (results.some((item) => item.ok)) notifyAssistantMutations();
  return results;
}

async function runAction(action: AssistantAction, runtime: AssistantRuntime): Promise<ActionResult> {
  const op = action.op.trim();
  if (op === "create_task") {
    const title = action.title?.trim();
    if (!title) return { ok: false, message: t("cursor.missingTaskTitle") };
    const projectId = await resolveProjectId(action.project);
    const task = await createTask({
      title,
      notes: action.notes,
      projectId,
      status: parseStatus(action.status),
      dueAt: parseDue(action.due) ?? null,
    });
    if (action.starred) await updateTask(task.id, { starred: true });
    return { ok: true, message: t("cursor.createdTask", { title: task.title }) };
  }
  if (op === "update_task" || op === "move_task") {
    const task = await resolveTask(action.match || action.title);
    if (!task) return { ok: false, message: t("cursor.taskNotFound", { match: action.match || action.title || "" }) };
    const notes =
      action.append_notes != null
        ? [task.notes.trim(), action.append_notes.trim()].filter(Boolean).join("\n")
        : action.notes;
    await updateTask(task.id, {
      title: action.title,
      notes,
      status: parseStatus(action.status),
      dueAt: parseDue(action.due),
      starred: action.starred,
      projectId: action.project ? await resolveProjectId(action.project) : undefined,
    });
    return { ok: true, message: t("cursor.updatedTask", { title: action.title?.trim() || task.title }) };
  }
  if (op === "delete_task") {
    const task = await resolveTask(action.match || action.title);
    if (!task) return { ok: false, message: t("cursor.taskNotFound", { match: action.match || action.title || "" }) };
    await deleteTask(task.id);
    return { ok: true, message: t("cursor.deletedTask", { title: task.title }) };
  }
  if (op === "create_project") {
    const name = action.name?.trim() || action.title?.trim();
    if (!name) return { ok: false, message: t("cursor.missingProjectName") };
    const project = await createProject(name);
    return { ok: true, message: t("cursor.createdProject", { name: project.name }) };
  }
  if (op === "rename_project") {
    const project = await resolveProject(action.match);
    if (!project) return { ok: false, message: t("cursor.projectNotFound", { match: action.match ?? "" }) };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: t("cursor.missingNewName") };
    await renameProject(project.id, name);
    return { ok: true, message: t("cursor.renamedProject", { from: project.name, to: name }) };
  }
  if (op === "archive_project") {
    const project = await resolveProject(action.match || action.name);
    if (!project) return { ok: false, message: t("cursor.projectNotFound", { match: action.match ?? "" }) };
    await archiveProject(project.id, true);
    return { ok: true, message: t("cursor.archivedProject", { name: project.name }) };
  }
  if (op === "create_playlist") {
    const name = action.name?.trim() || action.title?.trim();
    if (!name) return { ok: false, message: t("cursor.missingPlaylistName") };
    await createEmptyImportedPlaylist(name);
    if (action.tracks?.length) {
      const lists = await loadImportedPlaylists();
      const playlist = lists.find((item) => item.name === name);
      if (playlist) {
        const found = await resolveTracks(action.tracks);
        if (found.length) await addTracksToImportedPlaylist(playlist.id, found);
      }
    }
    return { ok: true, message: t("cursor.createdPlaylist", { name }) };
  }
  if (op === "rename_playlist") {
    const playlist = await resolvePlaylist(action.match);
    if (!playlist) return { ok: false, message: t("cursor.playlistNotFound", { match: action.match ?? "" }) };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: t("cursor.missingNewName") };
    await renameImportedPlaylist(playlist.id, name);
    return { ok: true, message: t("cursor.renamedPlaylist", { from: playlist.name, to: name }) };
  }
  if (op === "delete_playlist") {
    const playlist = await resolvePlaylist(action.match || action.name);
    if (!playlist) return { ok: false, message: t("cursor.playlistNotFound", { match: action.match ?? "" }) };
    await removeImportedPlaylist(playlist.id);
    return { ok: true, message: t("cursor.deletedPlaylist", { name: playlist.name }) };
  }
  if (op === "like_playlist") {
    const playlist = await resolvePlaylist(action.match || action.name);
    if (!playlist) return { ok: false, message: t("cursor.playlistNotFound", { match: action.match ?? "" }) };
    const want = action.liked !== false;
    if (Boolean(playlist.liked) !== want) await toggleImportedPlaylistLiked(playlist.id);
    return {
      ok: true,
      message: want
        ? t("cursor.playlistHomeOn", { name: playlist.name })
        : t("cursor.playlistHomeOff", { name: playlist.name }),
    };
  }
  if (op === "add_to_playlist") {
    const playlist = await resolvePlaylist(action.playlist || action.match);
    if (!playlist) return { ok: false, message: t("cursor.playlistNotFound", { match: action.playlist ?? "" }) };
    const found = await resolveTracks(action.tracks ?? []);
    if (!found.length) return { ok: false, message: t("cursor.missingTracks") };
    await addTracksToImportedPlaylist(playlist.id, found);
    return { ok: true, message: t("cursor.tracksAdded", { count: found.length, name: playlist.name }) };
  }
  if (op === "favorite_track") {
    const [track] = await resolveTracks([action.match || action.title || ""]);
    if (!track) return { ok: false, message: t("cursor.trackNotFound", { match: action.match ?? "" }) };
    const liked = (await loadFavorites()).some((item) => item.id === track.id);
    const want = action.liked !== false;
    if (liked !== want) await toggleFavorite(track);
    return {
      ok: true,
      message: want
        ? t("cursor.trackFavOn", { title: track.title })
        : t("cursor.trackFavOff", { title: track.title }),
    };
  }
  if (op === "rename_track") {
    const [track] = await resolveTracks([action.match || ""]);
    if (!track) return { ok: false, message: t("cursor.trackRenameNotFound", { match: action.match ?? "" }) };
    const name = action.name?.trim() || action.title?.trim();
    if (!name) return { ok: false, message: t("cursor.missingNewName") };
    await renameTrackTitle(track.id, name);
    const moved = track.id.startsWith("/")
      ? await tryMove(runtime.settings, runtime.password, track.id, withNewName(track.id, name))
      : null;
    return {
      ok: true,
      message: moved
        ? t("cursor.trackRenamedNas", { from: track.title, to: name })
        : t("cursor.trackRenamedApp", { from: track.title, to: name }),
    };
  }
  if (op === "rename_album") {
    const albums = await getAlbums();
    const album = bestMatch(albums, (item) => item.name, action.match || "");
    if (!album) return { ok: false, message: t("cursor.albumNotFound", { match: action.match ?? "" }) };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: t("cursor.missingNewName") };
    await renameAlbumName(album.id, name);
    const moved = album.id.startsWith("/")
      ? await tryMove(runtime.settings, runtime.password, album.id, withNewName(album.id, name))
      : null;
    return {
      ok: true,
      message: moved
        ? t("cursor.albumRenamedNas", { from: album.name, to: name })
        : t("cursor.albumRenamedApp", { from: album.name, to: name }),
    };
  }
  if (op === "rename_artist") {
    const artists = await getArtists();
    const artist = bestMatch(artists, (item) => item.name, action.match || "");
    if (!artist) return { ok: false, message: t("cursor.artistNotFound", { match: action.match ?? "" }) };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: t("cursor.missingNewName") };
    await renameArtistName(artist.id, name);
    const moved = artist.id.startsWith("/")
      ? await tryMove(runtime.settings, runtime.password, artist.id, withNewName(artist.id, name))
      : null;
    return {
      ok: true,
      message: moved
        ? t("cursor.artistRenamedNas", { from: artist.name, to: name })
        : t("cursor.artistRenamedApp", { from: artist.name, to: name }),
    };
  }
  if (op === "rename_video") {
    const shows = await listVideoShows(runtime.settings, runtime.password).catch(() => []);
    const show = bestMatch(shows, (item) => item.title, action.match || "");
    if (!show) return { ok: false, message: t("cursor.videoNotFound", { match: action.match ?? "" }) };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: t("cursor.missingNewName") };
    const moved = await tryMove(runtime.settings, runtime.password, show.path, withNewName(show.path, name));
    return {
      ok: Boolean(moved),
      message: moved
        ? t("cursor.videoRenamed", { from: show.title, to: name })
        : t("cursor.videoRenameFail", { title: show.title }),
    };
  }
  if (op === "favorite_video") {
    const shows = await listVideoShows(runtime.settings, runtime.password).catch(() => []);
    const show = bestMatch(shows, (item) => item.title, action.match || "");
    if (!show) return { ok: false, message: t("cursor.videoNotFound", { match: action.match ?? "" }) };
    const fav: VideoFavorite = {
      id: show.id,
      path: show.path,
      title: show.title,
      kind: show.kind === "movie" ? "movie" : "series",
      file: Boolean(show.file),
    };
    await loadVideoFavorites();
    await toggleVideoFavorite(fav);
    return { ok: true, message: t("cursor.videoFav", { title: show.title }) };
  }
  if (op === "create_tx") {
    const kind = parseTxKind(action.kind) ?? "expense";
    const quantity = parseMoney(action.quantity, 8);
    const price = parseMoney(action.price);
    const amount = parseMoney(action.amount) ?? (quantity != null && price != null ? quantity * price : undefined);
    const title = action.title?.trim() || action.name?.trim() || action.asset?.trim();
    if (amount == null || !(amount > 0)) return { ok: false, message: t("cursor.missingAmount") };
    if (!title) return { ok: false, message: t("cursor.missingConcept") };
    const account = await resolveAccount(action.account);
    const counter = await resolveAccount(action.counter);
    if (kind === "transfer" && !counter) {
      return { ok: false, message: t("cursor.missingTransferTo") };
    }
    const asset = await resolveAsset(action.asset || (kind === "sell" ? title : undefined));
    if (kind === "sell" && !asset) {
      return { ok: false, message: t("cursor.missingSellAsset") };
    }
    const tx = await createTx({
      kind,
      amount,
      title,
      category: action.category,
      notes: action.notes,
      bookedAt: parseDue(action.due) ?? undefined,
      accountId: kind === "transfer" ? account?.id ?? CASH_ACCOUNT_ID : account?.id ?? CASH_ACCOUNT_ID,
      counterAccountId: kind === "transfer" ? counter?.id ?? null : null,
      assetId: kind === "buy" || kind === "sell" ? asset?.id ?? null : null,
      quantity: kind === "buy" || kind === "sell" ? quantity ?? null : null,
      unitPrice: kind === "buy" || kind === "sell" ? price ?? null : null,
      assetName: kind === "buy" ? action.asset || title : undefined,
      assetTicker: action.ticker,
      assetKind: parseAssetKind(action.asset_kind) ?? (kind === "buy" ? "stock" : undefined),
    });
    return { ok: true, message: t("cursor.createdTx", { title: tx.title, kind: tx.kind, amount: tx.amount }) };
  }
  if (op === "delete_tx") {
    const tx = await resolveTx(action.match || action.title);
    if (!tx) return { ok: false, message: t("cursor.txNotFound", { match: action.match || action.title || "" }) };
    await deleteTx(tx.id);
    return { ok: true, message: t("cursor.deletedTx", { title: tx.title }) };
  }
  if (op === "create_account") {
    const name = action.name?.trim() || action.title?.trim();
    if (!name) return { ok: false, message: t("cursor.missingAccountName") };
    const account = await createAccount(name, parseAccountKind(action.kind) ?? "bank");
    return { ok: true, message: t("cursor.createdAccount", { name: account.name }) };
  }
  if (op === "rename_account") {
    const account = await resolveAccount(action.match);
    if (!account) return { ok: false, message: t("cursor.accountNotFound", { match: action.match ?? "" }) };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: t("cursor.missingNewName") };
    await renameAccount(account.id, name);
    return { ok: true, message: t("cursor.renamedAccount", { from: account.name, to: name }) };
  }
  if (op === "archive_account") {
    const account = await resolveAccount(action.match || action.name);
    if (!account) return { ok: false, message: t("cursor.accountNotFound", { match: action.match ?? "" }) };
    await archiveAccount(account.id, action.archived !== false);
    return {
      ok: true,
      message:
        action.archived === false
          ? t("cursor.accountRestored", { name: account.name })
          : t("cursor.accountArchived", { name: account.name }),
    };
  }
  if (op === "create_asset") {
    const name = action.name?.trim() || action.title?.trim();
    if (!name) return { ok: false, message: t("cursor.missingAssetName") };
    const quantity = parseMoney(action.quantity, 8) ?? 0;
    const price = parseMoney(action.price) ?? 0;
    let accountId: string | null = null;
    if (action.account) {
      const account = await resolveAccount(action.account);
      if (!account) return { ok: false, message: t("cursor.accountNotFound", { match: action.account ?? "" }) };
      accountId = account.id;
    }
    const asset = await createAsset({
      name,
      ticker: action.ticker,
      kind: parseAssetKind(action.kind) ?? parseAssetKind(action.asset_kind) ?? "other",
      accountId,
      quantity,
      price,
      costBasis: parseMoney(action.cost_basis) ?? quantity * price,
    });
    return { ok: true, message: t("cursor.createdAsset", { name: asset.name }) };
  }
  if (op === "update_asset" || op === "archive_asset") {
    const asset = await resolveAsset(action.match || action.name || action.ticker || action.title);
    if (!asset) return { ok: false, message: t("cursor.assetNotFound", { match: action.match || action.name || "" }) };
    let accountId: string | null | undefined;
    if (op === "update_asset" && action.account != null) {
      const raw = String(action.account).trim();
      if (!raw || raw === "none" || raw === "ninguna") accountId = null;
      else {
        const account = await resolveAccount(raw);
        if (!account) return { ok: false, message: t("cursor.accountNotFound", { match: action.account ?? "" }) };
        accountId = account.id;
      }
    }
    await updateAsset(asset.id, {
      name: action.name || action.title,
      ticker: action.ticker,
      kind: parseAssetKind(action.asset_kind || (op === "update_asset" ? action.kind : undefined)),
      accountId,
      quantity: parseMoney(action.quantity, 8),
      price: parseMoney(action.price),
      costBasis: parseMoney(action.cost_basis),
      archived: op === "archive_asset" ? action.archived !== false : action.archived,
    });
    return { ok: true, message: t("cursor.updatedAsset", { name: asset.name }) };
  }
  if (op === "quote_asset") {
    const asset = await resolveAsset(action.match || action.name || action.ticker || action.title);
    if (!asset) return { ok: false, message: t("cursor.assetNotFound", { match: action.match || action.name || "" }) };
    const price = parseMoney(action.price);
    if (price == null || !(price > 0)) return { ok: false, message: t("cursor.missingPrice") };
    await createQuote({
      assetId: asset.id,
      price,
      bookedAt: parseDue(action.due) ?? undefined,
    });
    return { ok: true, message: t("cursor.assetQuoted", { name: asset.name, price }) };
  }
  if (op === "create_goal") {
    const name = action.name?.trim() || action.title?.trim();
    const target = parseMoney(action.target) ?? parseMoney(action.amount);
    if (!name) return { ok: false, message: t("cursor.missingGoalName") };
    if (target == null || !(target > 0)) return { ok: false, message: t("cursor.missingGoalAmount") };
    const scope = parseGoalScope(action.scope) ?? "networth";
    const account = await resolveAccount(action.account);
    const asset = await resolveAsset(action.asset);
    if (scope === "account" && !account) {
      return { ok: false, message: t("cursor.missingGoalAccount") };
    }
    if (scope === "asset" && !asset) {
      return { ok: false, message: t("cursor.missingGoalAsset") };
    }
    const goal = await createGoal({
      name,
      target,
      scope,
      accountId: account?.id ?? null,
      assetId: asset?.id ?? null,
      deadlineAt: parseDue(action.due) ?? null,
    });
    return { ok: true, message: t("cursor.createdGoal", { name: goal.name, target: goal.target }) };
  }
  if (op === "update_goal") {
    const goal = await resolveGoal(action.match || action.title || action.name);
    if (!goal) return { ok: false, message: t("cursor.goalNotFound", { match: action.match || action.name || "" }) };
    const scope = parseGoalScope(action.scope);
    const account = action.account ? await resolveAccount(action.account) : null;
    const asset = action.asset ? await resolveAsset(action.asset) : null;
    await updateGoal(goal.id, {
      name: action.name || action.title,
      target: parseMoney(action.target) ?? parseMoney(action.amount),
      scope: scope ?? undefined,
      accountId: account?.id,
      assetId: asset?.id,
      deadlineAt: parseDue(action.due),
      archived: action.archived,
    });
    return { ok: true, message: t("cursor.updatedGoal", { name: goal.name }) };
  }
  if (op === "archive_goal" || op === "delete_goal") {
    const goal = await resolveGoal(action.match || action.title || action.name);
    if (!goal) return { ok: false, message: t("cursor.goalNotFound", { match: action.match || action.name || "" }) };
    if (op === "delete_goal") await deleteGoal(goal.id);
    else await updateGoal(goal.id, { archived: action.archived !== false });
    return {
      ok: true,
      message:
        op === "delete_goal"
          ? t("cursor.deletedGoal", { name: goal.name })
          : t("cursor.archivedGoal", { name: goal.name }),
    };
  }
  if (op === "create_reminder") {
    const title = action.title?.trim() || action.name?.trim();
    if (!title) return { ok: false, message: t("cursor.missingReminder") };
    const clock = parseClock(action) ?? { hour: 9, minute: 0 };
    const reminder = await createReminder({
      title,
      body: action.body || action.notes,
      hour: clock.hour,
      minute: clock.minute,
      frequency: parseFrequency(action.frequency) ?? "daily",
      weekday: parseWeekday(action.weekday),
      onceAt: parseDue(action.due) ?? null,
      enabled: action.enabled !== false,
    });
    return { ok: true, message: t("cursor.createdReminder", { title: reminder.title }) };
  }
  if (op === "update_reminder") {
    const reminder = await resolveReminder(action.match || action.title);
    if (!reminder) return { ok: false, message: t("cursor.reminderNotFound", { match: action.match ?? "" }) };
    const clock = parseClock(action);
    await updateReminder(reminder.id, {
      title: action.title || action.name,
      body: action.body ?? action.notes,
      hour: clock?.hour,
      minute: clock?.minute,
      frequency: parseFrequency(action.frequency),
      weekday: parseWeekday(action.weekday),
      onceAt: parseDue(action.due),
      enabled: action.enabled,
    });
    return { ok: true, message: t("cursor.updatedReminder", { title: reminder.title }) };
  }
  if (op === "delete_reminder") {
    const reminder = await resolveReminder(action.match || action.title);
    if (!reminder) return { ok: false, message: t("cursor.reminderNotFound", { match: action.match ?? "" }) };
    await deleteReminder(reminder.id);
    return { ok: true, message: t("cursor.deletedReminder", { title: reminder.title }) };
  }
  if (op === "set_zone") {
    const zone = parseZone(action.zone || action.name || action.match);
    if (!zone) return { ok: false, message: t("cursor.badZone") };
    if (!runtime.setZone(zone)) {
      return { ok: false, message: t("cursor.zoneHidden") };
    }
    return { ok: true, message: t("cursor.zoneSet", { zone }) };
  }
  return { ok: false, message: t("cursor.unknownAction", { op }) };
}

async function resolveProject(match?: string) {
  const projects = await listProjects({ includeArchived: true });
  if (!match) return null;
  return bestMatch(projects, (item) => item.name, match);
}

async function resolveProjectId(match?: string): Promise<string> {
  if (!match || normalize(match) === "bandeja" || normalize(match) === "inbox") return INBOX_PROJECT_ID;
  const project = await resolveProject(match);
  return project?.id ?? INBOX_PROJECT_ID;
}

async function resolveTask(match?: string) {
  if (!match) return null;
  const tasks = await listTasks({ includeArchived: true });
  return bestMatch(tasks, (item) => item.title, match);
}

async function resolvePlaylist(match?: string) {
  if (!match) return null;
  const playlists = await loadImportedPlaylists();
  return bestMatch(playlists, (item) => item.name, match);
}

async function resolveTracks(queries: string[]) {
  if (!queries.length) return [];
  const tracks = await getTracks();
  const found = [];
  for (const query of queries) {
    const hit = bestMatch(tracks, (item) => `${item.title} ${item.artistName}`, query);
    if (hit) found.push(hit);
  }
  return found;
}

async function resolveAccount(match?: string) {
  if (!match) return null;
  const accounts = await listAccounts({ includeArchived: true });
  const q = normalize(match);
  if (q === "caja" || q === "cash" || q === "efectivo") {
    return accounts.find((item) => item.id === CASH_ACCOUNT_ID) ?? null;
  }
  return bestMatch(accounts, (item) => item.name, match);
}

async function resolveAsset(match?: string) {
  if (!match) return null;
  const assets = await listAssets({ includeArchived: true });
  return (
    bestMatch(assets, (item) => item.ticker, match) ||
    bestMatch(assets, (item) => item.name, match)
  );
}

async function resolveTx(match?: string) {
  if (!match) return null;
  const txs = await listTx();
  return bestMatch(txs, (item) => item.title, match);
}

async function resolveGoal(match?: string) {
  if (!match) return null;
  const goals = await listGoals({ includeArchived: true });
  return bestMatch(goals, (item) => item.name, match);
}

async function resolveReminder(match?: string) {
  if (!match) return null;
  const reminders = await listReminders();
  return bestMatch(reminders, (item) => item.title, match);
}
