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
};

export type AssistantRuntime = {
  settings: NasSettings;
  password: string;
  setZone: (zone: AppZone) => void;
};

export type ActionResult = { ok: boolean; message: string };

const ACTION_BLOCK = /\[\[\[SND\]\]\]([\s\S]*?)\[\[\[\/SND\]\]\]/g;

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
  return null;
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
  visible = visible.replace(/```(?:json|snd)?\s*\{[\s\S]*?"actions"[\s\S]*?\}\s*```/gi, (block) => {
    try {
      const json = block.replace(/```(?:json|snd)?/gi, "").replace(/```/g, "").trim();
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
        message: error instanceof Error ? error.message : `No se pudo hacer ${action.op}.`,
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
    if (!title) return { ok: false, message: "Falta el título de la tarea." };
    const projectId = await resolveProjectId(action.project);
    const task = await createTask({
      title,
      notes: action.notes,
      projectId,
      status: parseStatus(action.status),
      dueAt: parseDue(action.due) ?? null,
    });
    if (action.starred) await updateTask(task.id, { starred: true });
    return { ok: true, message: `Creada «${task.title}».` };
  }
  if (op === "update_task" || op === "move_task") {
    const task = await resolveTask(action.match || action.title);
    if (!task) return { ok: false, message: `No encuentro la tarea «${action.match || action.title}».` };
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
    return { ok: true, message: `Actualizada «${action.title?.trim() || task.title}».` };
  }
  if (op === "delete_task") {
    const task = await resolveTask(action.match || action.title);
    if (!task) return { ok: false, message: `No encuentro la tarea «${action.match || action.title}».` };
    await deleteTask(task.id);
    return { ok: true, message: `Eliminada «${task.title}».` };
  }
  if (op === "create_project") {
    const name = action.name?.trim() || action.title?.trim();
    if (!name) return { ok: false, message: "Falta el nombre del proyecto." };
    const project = await createProject(name);
    return { ok: true, message: `Proyecto «${project.name}» creado.` };
  }
  if (op === "rename_project") {
    const project = await resolveProject(action.match);
    if (!project) return { ok: false, message: `No encuentro el proyecto «${action.match}».` };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: "Falta el nombre nuevo." };
    await renameProject(project.id, name);
    return { ok: true, message: `Proyecto «${project.name}» → «${name}».` };
  }
  if (op === "archive_project") {
    const project = await resolveProject(action.match || action.name);
    if (!project) return { ok: false, message: `No encuentro el proyecto «${action.match}».` };
    await archiveProject(project.id, true);
    return { ok: true, message: `Archivado «${project.name}».` };
  }
  if (op === "create_playlist") {
    const name = action.name?.trim() || action.title?.trim();
    if (!name) return { ok: false, message: "Falta el nombre de la playlist." };
    await createEmptyImportedPlaylist(name);
    if (action.tracks?.length) {
      const lists = await loadImportedPlaylists();
      const playlist = lists.find((item) => item.name === name);
      if (playlist) {
        const found = await resolveTracks(action.tracks);
        if (found.length) await addTracksToImportedPlaylist(playlist.id, found);
      }
    }
    return { ok: true, message: `Playlist «${name}» creada.` };
  }
  if (op === "rename_playlist") {
    const playlist = await resolvePlaylist(action.match);
    if (!playlist) return { ok: false, message: `No encuentro la playlist «${action.match}».` };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: "Falta el nombre nuevo." };
    await renameImportedPlaylist(playlist.id, name);
    return { ok: true, message: `Playlist «${playlist.name}» → «${name}».` };
  }
  if (op === "delete_playlist") {
    const playlist = await resolvePlaylist(action.match || action.name);
    if (!playlist) return { ok: false, message: `No encuentro la playlist «${action.match}».` };
    await removeImportedPlaylist(playlist.id);
    return { ok: true, message: `Eliminada la playlist «${playlist.name}».` };
  }
  if (op === "like_playlist") {
    const playlist = await resolvePlaylist(action.match || action.name);
    if (!playlist) return { ok: false, message: `No encuentro la playlist «${action.match}».` };
    const want = action.liked !== false;
    if (Boolean(playlist.liked) !== want) await toggleImportedPlaylistLiked(playlist.id);
    return { ok: true, message: want ? `«${playlist.name}» en inicio.` : `«${playlist.name}» quitada de inicio.` };
  }
  if (op === "add_to_playlist") {
    const playlist = await resolvePlaylist(action.playlist || action.match);
    if (!playlist) return { ok: false, message: `No encuentro la playlist «${action.playlist}».` };
    const found = await resolveTracks(action.tracks ?? []);
    if (!found.length) return { ok: false, message: "No encontré esas canciones." };
    await addTracksToImportedPlaylist(playlist.id, found);
    return { ok: true, message: `${found.length} tema(s) en «${playlist.name}».` };
  }
  if (op === "favorite_track") {
    const [track] = await resolveTracks([action.match || action.title || ""]);
    if (!track) return { ok: false, message: `No encuentro «${action.match}».` };
    const liked = (await loadFavorites()).some((item) => item.id === track.id);
    const want = action.liked !== false;
    if (liked !== want) await toggleFavorite(track);
    return { ok: true, message: want ? `«${track.title}» en favoritos.` : `«${track.title}» fuera de favoritos.` };
  }
  if (op === "rename_track") {
    const [track] = await resolveTracks([action.match || ""]);
    if (!track) return { ok: false, message: `No encuentro la pista «${action.match}».` };
    const name = action.name?.trim() || action.title?.trim();
    if (!name) return { ok: false, message: "Falta el nombre nuevo." };
    await renameTrackTitle(track.id, name);
    const moved = track.id.startsWith("/")
      ? await tryMove(runtime.settings, runtime.password, track.id, withNewName(track.id, name))
      : null;
    return {
      ok: true,
      message: moved
        ? `Canción «${track.title}» → «${name}» (también en el NAS).`
        : `Canción «${track.title}» → «${name}» en la app.`,
    };
  }
  if (op === "rename_album") {
    const albums = await getAlbums();
    const album = bestMatch(albums, (item) => item.name, action.match || "");
    if (!album) return { ok: false, message: `No encuentro el álbum «${action.match}».` };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: "Falta el nombre nuevo." };
    await renameAlbumName(album.id, name);
    const moved = album.id.startsWith("/")
      ? await tryMove(runtime.settings, runtime.password, album.id, withNewName(album.id, name))
      : null;
    return {
      ok: true,
      message: moved
        ? `Álbum «${album.name}» → «${name}» (también en el NAS).`
        : `Álbum «${album.name}» → «${name}» en la app.`,
    };
  }
  if (op === "rename_artist") {
    const artists = await getArtists();
    const artist = bestMatch(artists, (item) => item.name, action.match || "");
    if (!artist) return { ok: false, message: `No encuentro el artista «${action.match}».` };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: "Falta el nombre nuevo." };
    await renameArtistName(artist.id, name);
    const moved = artist.id.startsWith("/")
      ? await tryMove(runtime.settings, runtime.password, artist.id, withNewName(artist.id, name))
      : null;
    return {
      ok: true,
      message: moved
        ? `Artista «${artist.name}» → «${name}» (también en el NAS).`
        : `Artista «${artist.name}» → «${name}» en la app.`,
    };
  }
  if (op === "rename_video") {
    const shows = await listVideoShows(runtime.settings, runtime.password).catch(() => []);
    const show = bestMatch(shows, (item) => item.title, action.match || "");
    if (!show) return { ok: false, message: `No encuentro el vídeo «${action.match}».` };
    const name = action.name?.trim();
    if (!name) return { ok: false, message: "Falta el nombre nuevo." };
    const moved = await tryMove(runtime.settings, runtime.password, show.path, withNewName(show.path, name));
    return {
      ok: Boolean(moved),
      message: moved
        ? `Vídeo «${show.title}» → «${name}» en el NAS.`
        : `No pude renombrar «${show.title}» en el NAS.`,
    };
  }
  if (op === "favorite_video") {
    const shows = await listVideoShows(runtime.settings, runtime.password).catch(() => []);
    const show = bestMatch(shows, (item) => item.title, action.match || "");
    if (!show) return { ok: false, message: `No encuentro el vídeo «${action.match}».` };
    const fav: VideoFavorite = {
      id: show.id,
      path: show.path,
      title: show.title,
      kind: show.kind === "movie" ? "movie" : "series",
      file: Boolean(show.file),
    };
    await loadVideoFavorites();
    await toggleVideoFavorite(fav);
    return { ok: true, message: `Favorito de vídeo: «${show.title}».` };
  }
  if (op === "set_zone") {
    const zone = parseZone(action.zone || action.name || action.match);
    if (!zone) return { ok: false, message: "Zona no válida. Usa música, podcasts, vídeo o productividad." };
    runtime.setZone(zone);
    return { ok: true, message: `Zona: ${zone}.` };
  }
  return { ok: false, message: `No conozco la acción «${op}».` };
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
