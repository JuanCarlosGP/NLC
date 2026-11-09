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
import { isPathInside, sidecarCoverPath, toWebDavPath } from "@/lib/nas/webdav";
import { videoSourceSettings, type NasSettings } from "@/lib/settings/storage.impl";
import { usesNas } from "@/lib/settings/service-source";
import { isLocalVideoPath } from "@/lib/local/local-video";
import {
  addTracksToImportedPlaylist,
  createEmptyImportedPlaylist,
  loadImportedPlaylists,
  removeImportedPlaylist,
  removeTrackFromImportedPlaylist,
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
import { INBOX_PROJECT_ID, projectDisplayName, type TaskStatus } from "@/lib/productivity/types";
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
  updateTx,
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
import { dateLocale, t } from "@/lib/i18n/runtime";
import { AssistantChoiceError, describeMatches, normalizeRecordName as normalize, uniqueRecord } from "./record-match";

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
  storage?: string;
};

export type AssistantRuntime = {
  settings: NasSettings;
  password: string;
  setZone: (zone: AppZone) => boolean;
};

export type ActionResult = { ok: boolean; message: string; modelText?: string };

const ACTION_BLOCK = /\[\[\[(?:NLC|SND)\]\]\]([\s\S]*?)\[\[\[\/(?:NLC|SND)\]\]\]/g;

function parseDue(raw: string | null | undefined): number | null | undefined {
  if (raw == null) return undefined;
  const value = raw.trim().toLowerCase();
  if (!value || value === "none" || value === "sin fecha") return null;
  if (value === "today" || value === "hoy") return dueToday();
  if (value === "tomorrow" || value === "manana" || value === "mañana") return dueTomorrow();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) {
    const date = new Date(`${value}T00:00:00`);
    if (date.getFullYear() !== Number(day[1]) || date.getMonth() + 1 !== Number(day[2]) || date.getDate() !== Number(day[3])) {
      return undefined;
    }
    return date.getTime();
  }
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
  if (value === "health" || value === "salud") return "health";
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
  const root = toWebDavPath(settings.sharePath);
  const source = toWebDavPath(from);
  const target = toWebDavPath(to);
  if (!from.startsWith("/") || from === to || !root || root === "/" || source === root
    || !isPathInside(root, source) || !isPathInside(root, target)
    || source.split("/").some(part => part === "." || part === "..")
    || target.split("/").some(part => part === "." || part === "..")) return null;
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
  return { actions: actions.filter(action => action && typeof action.op === "string").slice(0, 12), visible: visible.trim() };
}

export async function executeAssistantActions(
  actions: AssistantAction[],
  runtime: AssistantRuntime,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const action of actions) {
    try {
      const result = await runAction(action, runtime);
      results.push(result);
      if (!result.ok) break;
    } catch (error) {
      results.push({
        ok: false,
        modelText: error instanceof AssistantChoiceError ? error.modelText : undefined,
        message: error instanceof Error ? error.message : t("cursor.actionFailed", { op: action.op }),
      });
      break;
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
    const status = parseStatus(action.status);
    if (action.status !== undefined && !status) return { ok: false, message: t("cursor.invalidTaskStatus") };
    const dueAt = parseDue(action.due);
    if (action.due != null && dueAt === undefined) return { ok: false, message: t("cursor.invalidTaskDate") };
    const projectId = await resolveProjectId(action.project);
    const task = await createTask({
      title,
      notes: action.notes,
      projectId,
      status,
      dueAt: dueAt ?? null,
    });
    if (action.starred) await updateTask(task.id, { starred: true });
    return { ok: true, message: t("cursor.createdTask", { title: task.title }) };
  }
  if (op === "update_task" || op === "move_task") {
    const task = await resolveTask(action.match || action.title);
    if (!task) return { ok: false, message: t("cursor.taskNotFound", { match: action.match || action.title || "" }) };
    const status = parseStatus(action.status);
    if (action.status !== undefined && !status) return { ok: false, message: t("cursor.invalidTaskStatus") };
    const dueAt = parseDue(action.due);
    if (action.due != null && dueAt === undefined) return { ok: false, message: t("cursor.invalidTaskDate") };
    const notes =
      action.append_notes != null
        ? [task.notes.trim(), action.append_notes.trim()].filter(Boolean).join("\n")
        : action.notes;
    await updateTask(task.id, {
      title: action.title,
      notes,
      status,
      dueAt,
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
    const tracks = await resolveTracks(action.tracks ?? [], true);
    await createEmptyImportedPlaylist(name, tracks);
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
    const found = await resolveTracks(action.tracks ?? [], true);
    if (!found.length) return { ok: false, message: t("cursor.missingTracks") };
    const existing = new Set(playlist.tracks.map(track => track.matched?.id ?? track.spotifyId));
    const added = found.filter(track => !existing.has(track.id));
    if (!added.length) return { ok: true, message: t("cursor.tracksAlreadyInPlaylist", { name: playlist.name }) };
    const result = await addTracksToImportedPlaylist(playlist.id, added);
    if (!result.some(item => item.id === playlist.id)) {
      return { ok: false, message: t("cursor.playlistNotFound", { match: playlist.name }) };
    }
    return { ok: true, message: t("cursor.tracksAdded", { count: added.length, name: playlist.name }) };
  }
  if (op === "remove_from_playlist") {
    const playlist = await resolvePlaylist(action.playlist);
    if (!playlist) return { ok: false, message: t("cursor.playlistNotFound", { match: action.playlist ?? "" }) };
    const entries = playlist.tracks.map(track => ({ ...track, id: track.matched?.id ?? track.spotifyId }));
    const track = uniqueRecord(entries, trackNames, action.match ?? "", trackLabel);
    if (!track) return { ok: false, message: t("cursor.trackNotFound", { match: action.match ?? "" }) };
    const result = await removeTrackFromImportedPlaylist(playlist.id, track.id);
    if (!result.some(item => item.id === playlist.id)) {
      return { ok: false, message: t("cursor.playlistNotFound", { match: playlist.name }) };
    }
    return { ok: true, message: t("cursor.trackRemovedFromPlaylist", { title: track.title, name: playlist.name }) };
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
    const album = uniqueRecord(albums, albumNames, action.match || "", albumLabel);
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
    const artist = uniqueRecord(artists, (item) => item.name, action.match || "");
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
    const show = uniqueRecord(shows, (item) => item.title, action.match || "");
    if (!show) return { ok: false, message: t("cursor.videoNotFound", { match: action.match ?? "" }) };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: t("cursor.missingNewName") };
    const source = videoSourceSettings(runtime.settings);
    const moved = usesNas(runtime.settings, "video") && !isLocalVideoPath(show.path)
      ? await tryMove(source, runtime.password, show.path, withNewName(show.path, name))
      : null;
    return {
      ok: Boolean(moved),
      message: moved
        ? t("cursor.videoRenamed", { from: show.title, to: name })
        : t("cursor.videoRenameFail", { title: show.title }),
    };
  }
  if (op === "favorite_video") {
    const shows = await listVideoShows(runtime.settings, runtime.password).catch(() => []);
    const show = uniqueRecord(shows, (item) => item.title, action.match || "");
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
    const kind = action.kind == null ? "expense" : parseTxKind(action.kind);
    if (!kind) return { ok: false, message: t("cursor.invalidTransactionKind") };
    const quantity = parseMoney(action.quantity, 8);
    const price = parseMoney(action.price);
    const amount = parseMoney(action.amount) ?? (quantity != null && price != null ? quantity * price : undefined);
    const title = action.title?.trim() || action.name?.trim() || action.asset?.trim();
    if (amount == null || !(amount > 0)) return { ok: false, message: t("cursor.missingAmount") };
    if (!title) return { ok: false, message: t("cursor.missingConcept") };
    const account = await resolveAccount(action.account);
    if (action.account?.trim() && !account) {
      return { ok: false, message: t("cursor.accountNotFound", { match: action.account }) };
    }
    const counter = kind === "transfer" ? await resolveAccount(action.counter) : null;
    if (kind === "transfer" && !counter) {
      return { ok: false, message: t("cursor.missingTransferTo") };
    }
    const bookedAt = parseDue(action.due);
    if (action.due != null && bookedAt === undefined) return { ok: false, message: t("cursor.invalidTransactionDate") };
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
      bookedAt: bookedAt ?? undefined,
      accountId: account?.id ?? CASH_ACCOUNT_ID,
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
  if (op === "update_tx") {
    const tx = await resolveTx(action.match);
    if (!tx) return { ok: false, message: t("cursor.txNotFound", { match: action.match ?? "" }) };
    if (tx.kind !== "income" && tx.kind !== "expense") {
      return { ok: false, message: t("cursor.editTransactionType") };
    }
    const title = action.title?.trim() ?? tx.title;
    const amount = action.amount === undefined ? tx.amount : parseMoney(action.amount);
    const date = action.due === undefined ? tx.bookedAt : parseDue(action.due);
    if (!title) return { ok: false, message: t("cursor.missingConcept") };
    if (amount === undefined || amount <= 0) return { ok: false, message: t("cursor.missingAmount") };
    if (date == null) return { ok: false, message: t("cursor.invalidTransactionDate") };
    const account = await resolveAccount(action.account);
    if (action.account?.trim() && !account) {
      return { ok: false, message: t("cursor.accountNotFound", { match: action.account }) };
    }
    const updated = await updateTx(tx.id, {
      kind: tx.kind,
      title,
      amount,
      bookedAt: date,
      accountId: account?.id ?? tx.accountId,
      category: action.category ?? tx.category,
      notes: action.notes ?? tx.notes,
    });
    return { ok: true, message: t("cursor.updatedTransaction", { title: updated.title }) };
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
  return uniqueRecord(projects, (item) => item.name, match);
}

async function resolveProjectId(match?: string): Promise<string> {
  if (!match || normalize(match) === "bandeja" || normalize(match) === "inbox") return INBOX_PROJECT_ID;
  const project = await resolveProject(match);
  if (!project || project.archived) throw new AssistantChoiceError(t("cursor.projectNotFound", { match }));
  return project.id;
}

async function resolveTask(match?: string) {
  if (!match) return null;
  const { tasks, names, label } = await taskMatches();
  return uniqueRecord(tasks, names, match, label);
}

async function resolvePlaylist(match?: string) {
  if (!match) return null;
  const playlists = await loadImportedPlaylists();
  return uniqueRecord(playlists, (item) => item.name, match);
}

type NamedTrack = { title: string; artistName: string; albumName: string };
const trackLabel = (track: NamedTrack) =>
  [track.title, track.artistName, track.albumName].filter(Boolean).join(" · ");
const trackNames = (track: NamedTrack) =>
  [track.title, `${track.title} ${track.artistName}`, trackLabel(track)];
const albumLabel = (album: Awaited<ReturnType<typeof getAlbums>>[number]) =>
  `${album.name} · ${album.artistName}`;
const albumNames = (album: Awaited<ReturnType<typeof getAlbums>>[number]) =>
  [album.name, albumLabel(album), `${album.name} ${album.artistName}`];
const assetNames = (asset: Awaited<ReturnType<typeof listAssets>>[number]) =>
  [asset.name, asset.ticker, `${asset.name} ${asset.ticker}`];
const txLabel = (tx: Awaited<ReturnType<typeof listTx>>[number]) =>
  `${tx.title} · ${new Date(tx.bookedAt).toLocaleDateString(dateLocale())} · ${tx.amount} ${tx.currency}`;
const txNames = (tx: Awaited<ReturnType<typeof listTx>>[number]) => [tx.title, txLabel(tx)];

async function taskMatches() {
  const [tasks, projects] = await Promise.all([
    listTasks({ includeArchived: true }), listProjects({ includeArchived: true }),
  ]);
  const projectNames = new Map(projects.map(project => [project.id, projectDisplayName(project)]));
  type Task = typeof tasks[number];
  const label = (task: Task) => [task.title, projectNames.get(task.projectId)].filter(Boolean).join(" · ");
  const names = (task: Task) => [task.title, label(task)];
  return { tasks, names, label };
}

async function resolveTracks(queries: string[], requireAll = false) {
  if (!queries.length) return [];
  const tracks = await getTracks();
  const found = new Map<string, typeof tracks[number]>();
  for (const query of queries) {
    const hit = uniqueRecord(tracks, trackNames, query, trackLabel);
    if (hit) found.set(hit.id, hit);
    else if (requireAll) throw new AssistantChoiceError(t("cursor.trackNotFound", { match: query }));
  }
  return [...found.values()];
}

async function resolveAccount(match?: string) {
  if (!match) return null;
  const accounts = await listAccounts({ includeArchived: true });
  const q = normalize(match);
  if (q === "caja" || q === "cash" || q === "efectivo") {
    return accounts.find((item) => item.id === CASH_ACCOUNT_ID) ?? null;
  }
  return uniqueRecord(accounts, (item) => item.name, match);
}

async function resolveAsset(match?: string) {
  if (!match) return null;
  const assets = await listAssets({ includeArchived: true });
  return uniqueRecord(assets, assetNames, match, asset => `${asset.name} · ${asset.ticker}`);
}

async function resolveTx(match?: string) {
  if (!match) return null;
  const txs = await listTx();
  return uniqueRecord(txs, txNames, match, txLabel);
}

async function resolveGoal(match?: string) {
  if (!match) return null;
  const goals = await listGoals({ includeArchived: true });
  return uniqueRecord(goals, (item) => item.name, match);
}

async function resolveReminder(match?: string) {
  if (!match) return null;
  const reminders = await listReminders();
  return uniqueRecord(reminders, (item) => item.title, match);
}

export async function searchAssistantRecords(kind: unknown, query: string, runtime: AssistantRuntime) {
  switch (kind) {
    case "task": {
      const { tasks, names, label } = await taskMatches();
      return describeMatches(tasks, names, query, label);
    }
    case "project": return describeMatches(await listProjects({ includeArchived: true }), projectDisplayName, query);
    case "track": return describeMatches(await getTracks(), trackNames, query, trackLabel);
    case "playlist": return describeMatches(await loadImportedPlaylists(), item => item.name, query);
    case "album": return describeMatches(await getAlbums(), albumNames, query, albumLabel);
    case "artist": return describeMatches(await getArtists(), item => item.name, query);
    case "video": return describeMatches(await listVideoShows(runtime.settings, runtime.password), item => item.title, query);
    case "transaction": return describeMatches(await listTx(), txNames, query, txLabel);
    case "account": return describeMatches(await listAccounts({ includeArchived: true }), item => item.name, query);
    case "asset": return describeMatches(await listAssets({ includeArchived: true }), assetNames, query, item => `${item.name} · ${item.ticker}`);
    case "goal": return describeMatches(await listGoals({ includeArchived: true }), item => item.name, query);
    case "reminder": return describeMatches(await listReminders(), item => item.title, query);
    default: throw new Error(t("cursor.searchKindMissing"));
  }
}
