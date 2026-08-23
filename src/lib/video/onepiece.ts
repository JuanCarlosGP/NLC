import type { NasSettings } from "@/lib/settings/storage";
import { videoSourceSettings } from "@/lib/settings/storage";
import { createVideoClient } from "@/lib/video/source";
import type { VideoArc, VideoEpisode, VideoSaga } from "@/lib/video/types";
import { extOf, toWebDavPath } from "@/lib/nas/webdav";

export const ONE_PIECE_ROOT = "/Popcorn/series/onepiece";

export function onePieceRoot(settings: NasSettings): string {
  const share = toWebDavPath(videoSourceSettings(settings).sharePath);
  return `${share}/series/onepiece`;
}

const SKIP_DIRS = new Set(["storyboards", "@eadir", "#recycle", "#snapshot", ".trash", "lost+found"]);
const VIDEO_EXT = new Set(["mp4", "mkv", "m4v", "webm", "avi", "mov"]);

function humanizeToken(raw: string): string {
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSagaName(name: string): { order: number; title: string } | null {
  const match = name.match(/^(\d+)\.(.+)$/);
  if (!match) return null;
  return { order: Number(match[1]), title: humanizeToken(match[2]!) };
}

export function parseArcName(name: string): {
  order: number;
  title: string;
  episodeStart: number | null;
  episodeEnd: number | null;
} | null {
  const match = name.match(/^(\d+)\s*-\s*(.+?)(?:\s*\((\d+)\)\s*-\s*\((\d+)\))?\s*$/);
  if (!match) return null;
  return {
    order: Number(match[1]),
    title: match[2]!.trim(),
    episodeStart: match[3] ? Number(match[3]) : null,
    episodeEnd: match[4] ? Number(match[4]) : null,
  };
}

export function parseEpisodeName(name: string): { number: number; title: string } | null {
  if (!VIDEO_EXT.has(extOf(name))) return null;
  const stem = name.replace(/\.[^.]+$/, "");
  const match = stem.match(/^(\d+)/);
  if (match) {
    const number = Number(match[1]);
    const rest = humanizeToken(stem.slice(match[1].length).replace(/^[\s.\-_]+/, ""));
    return { number, title: rest || `Episodio ${number}` };
  }
  return { number: 99_999, title: humanizeToken(stem) };
}

function encodeId(path: string): string {
  return encodeURIComponent(path);
}

export function decodeVideoId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export async function listOnePieceSagas(
  settings: NasSettings,
  password: string,
  rootPath?: string,
): Promise<VideoSaga[]> {
  const { listDir } = createVideoClient(settings, password);
  const entries = await listDir(rootPath ?? onePieceRoot(settings));
  const sagas: VideoSaga[] = [];
  for (const entry of entries) {
    if (!entry.dir) continue;
    if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
    const parsed = parseSagaName(entry.name);
    if (!parsed) continue;
    const path = entry.path.replace(/\/+$/, "");
    sagas.push({
      id: encodeId(path),
      path,
      order: parsed.order,
      title: parsed.title,
    });
  }
  return sagas.sort((a, b) => a.order - b.order);
}

export async function listOnePieceArcs(
  settings: NasSettings,
  password: string,
  sagaPath: string,
): Promise<VideoArc[]> {
  const { listDir } = createVideoClient(settings, password);
  const root = sagaPath.replace(/\/+$/, "");
  const entries = await listDir(root);
  const arcs: VideoArc[] = [];
  for (const entry of entries) {
    if (!entry.dir) continue;
    if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
    const parsed = parseArcName(entry.name);
    if (!parsed) continue;
    const path = entry.path.replace(/\/+$/, "");
    arcs.push({
      id: encodeId(path),
      path,
      order: parsed.order,
      title: parsed.title,
      episodeStart: parsed.episodeStart,
      episodeEnd: parsed.episodeEnd,
      sagaPath: root,
    });
  }
  return arcs.sort((a, b) => a.order - b.order);
}

export async function listOnePieceEpisodes(
  settings: NasSettings,
  password: string,
  arcPath: string,
): Promise<VideoEpisode[]> {
  const { listDir } = createVideoClient(settings, password);
  const root = arcPath.replace(/\/+$/, "");
  const entries = await listDir(root);
  const episodes: VideoEpisode[] = [];
  for (const entry of entries) {
    if (entry.dir) continue;
    const parsed = parseEpisodeName(entry.name);
    if (!parsed) continue;
    const path = entry.path.replace(/\/+$/, "");
    episodes.push({
      id: encodeId(path),
      path,
      number: parsed.number,
      title: parsed.title,
      arcPath: root,
    });
  }
  return episodes.sort((a, b) => a.number - b.number);
}

export async function episodeStreamUrl(settings: NasSettings, password: string, episodePath: string) {
  const { playable } = createVideoClient(settings, password);
  return playable(episodePath);
}

export async function collectOnePieceEpisodes(
  settings: NasSettings,
  password: string,
  target: { kind: "saga" | "arc" | "episode"; path: string; episode?: VideoEpisode },
): Promise<VideoEpisode[]> {
  if (target.kind === "episode") return target.episode ? [target.episode] : [];
  if (target.kind === "arc") return listOnePieceEpisodes(settings, password, target.path);
  const arcs = await listOnePieceArcs(settings, password, target.path);
  const episodes: VideoEpisode[] = [];
  for (const arc of arcs) {
    episodes.push(...(await listOnePieceEpisodes(settings, password, arc.path)));
  }
  return episodes;
}

export function formatEpisodeRange(start: number | null, end: number | null): string | null {
  if (start == null || end == null) return null;
  return `Episodios ${start}–${end}`;
}

function parentPath(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "";
}

export function episodeLocation(episodePath: string): {
  arcPath: string;
  sagaPath: string;
  arcTitle: string;
  sagaTitle: string;
} {
  const arcPath = parentPath(episodePath);
  const sagaPath = parentPath(arcPath);
  const arcName = arcPath.split("/").pop() ?? "";
  const sagaName = sagaPath.split("/").pop() ?? "";
  return {
    arcPath,
    sagaPath,
    arcTitle: parseArcName(arcName)?.title ?? humanizeToken(arcName),
    sagaTitle: parseSagaName(sagaName)?.title ?? humanizeToken(sagaName),
  };
}

export function watchRoute(path: string, arcPath: string) {
  return {
    pathname: "/watch/[...path]" as const,
    params: {
      path: path.replace(/^\//, "").split("/"),
      arc: encodeURIComponent(arcPath),
    },
  };
}

export async function findNextOnePieceEpisode(
  settings: NasSettings,
  password: string,
  current: { path: string; arcPath: string; sagaPath: string; number?: number },
): Promise<VideoEpisode | null> {
  const arcPath = current.arcPath.replace(/\/+$/, "");
  const sagaPath = current.sagaPath.replace(/\/+$/, "");

  if (arcPath) {
    const episodes = await listOnePieceEpisodes(settings, password, arcPath);
    const byPath = episodes.findIndex((episode) => episode.path === current.path);
    const byNumber =
      current.number != null ? episodes.findIndex((episode) => episode.number === current.number) : -1;
    const index = byPath >= 0 ? byPath : byNumber;
    if (index >= 0 && episodes[index + 1]) return episodes[index + 1]!;
  }

  if (sagaPath) {
    const arcs = await listOnePieceArcs(settings, password, sagaPath);
    const arcIndex = arcs.findIndex((arc) => arc.path === arcPath);
    const later = arcIndex >= 0 ? arcs.slice(arcIndex + 1) : arcs;
    for (const arc of later) {
      const list = await listOnePieceEpisodes(settings, password, arc.path);
      if (list[0]) return list[0];
    }
  }

  const sagas = await listOnePieceSagas(settings, password);
  const sagaIndex = sagas.findIndex((saga) => saga.path === sagaPath);
  const laterSagas = sagaIndex >= 0 ? sagas.slice(sagaIndex + 1) : [];
  for (const saga of laterSagas) {
    const arcs = await listOnePieceArcs(settings, password, saga.path);
    for (const arc of arcs) {
      const list = await listOnePieceEpisodes(settings, password, arc.path);
      if (list[0]) return list[0];
    }
  }
  return null;
}
