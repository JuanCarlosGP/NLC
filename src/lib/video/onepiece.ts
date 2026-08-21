import type { NasSettings } from "@/lib/settings/storage";
import { createVideoDavClient } from "@/lib/video/dav";
import type { VideoArc, VideoEpisode, VideoSaga } from "@/lib/video/types";
import { extOf } from "@/lib/nas/webdav";

export const ONE_PIECE_ROOT = "/Popcorn/series/onepiece";

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
  const match = name.match(/^(\d+)/);
  if (!match) return null;
  const number = Number(match[1]);
  return { number, title: `Episodio ${number}` };
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
): Promise<VideoSaga[]> {
  const { listDir } = createVideoDavClient(settings, password);
  const entries = await listDir(ONE_PIECE_ROOT);
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
  const { listDir } = createVideoDavClient(settings, password);
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
  const { listDir } = createVideoDavClient(settings, password);
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

export function episodeStreamUrl(settings: NasSettings, password: string, episodePath: string) {
  const { playable } = createVideoDavClient(settings, password);
  return playable(episodePath);
}

export function formatEpisodeRange(start: number | null, end: number | null): string | null {
  if (start == null || end == null) return null;
  return `Episodios ${start}–${end}`;
}
