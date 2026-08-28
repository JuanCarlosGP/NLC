import { collateLocale, t } from "@/lib/i18n/runtime";
import type { NasSettings } from "@/lib/settings/storage";
import { createVideoClient } from "@/lib/video/source";
import { LOCAL_VIDEO_ROOT, isLocalVideoPath } from "@/lib/local/local-video";
import { showTitle, videoShareRoot } from "@/lib/video/catalog";
import {
  parseArcName,
  parseEpisodeName,
  parseSagaName,
} from "@/lib/video/onepiece";
import type { VideoEpisode } from "@/lib/video/types";
import type { WebDavEntry } from "@/lib/nas/webdav";

const SKIP_DIRS = new Set(["storyboards", "@eadir", "#recycle", "#snapshot", ".trash", "lost+found"]);
const MAX_DEPTH = 5;
const MAX_EPISODES = 2500;

export type FolderRole = "season" | "saga" | "arc" | "folder";

export type VideoFolderItem = {
  id: string;
  path: string;
  title: string;
  order: number;
  subtitle: string | null;
  role: FolderRole;
};

export type VideoEpisodeItem = {
  id: string;
  path: string;
  title: string;
  number: number;
  parentPath: string;
};

export type VideoListing = {
  path: string;
  title: string;
  eyebrow: string;
  summary: string;
  folders: VideoFolderItem[];
  episodes: VideoEpisodeItem[];
};

export function encodeVideoId(path: string): string {
  return encodeURIComponent(path);
}

export function browseRoute(path: string) {
  return {
    pathname: "/video/browse/[id]" as const,
    params: { id: encodeVideoId(path) },
  };
}

export function parentPath(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "";
}

export function baseName(path: string): string {
  return path.replace(/\/+$/, "").split("/").filter(Boolean).at(-1) ?? path;
}

export function seriesFromPath(path: string): { id: string; title: string; root: string } {
  const series = path.match(/\/series\/([^/]+)/i);
  if (series?.[1] && series.index != null) {
    return {
      id: series[1].toLowerCase(),
      title: showTitle(series[1]),
      root: path.slice(0, series.index + series[0].length),
    };
  }
  const movie = path.match(/\/movies\/([^/]+)/i);
  if (movie?.[1] && movie.index != null) {
    return {
      id: movie[1].toLowerCase(),
      title: showTitle(movie[1]),
      root: path.slice(0, movie.index + movie[0].length),
    };
  }
  const name = baseName(path);
  return { id: name.toLowerCase(), title: showTitle(name), root: path.replace(/\/+$/, "") };
}

function parseSeasonName(name: string): { order: number; title: string } | null {
  const match = name.match(/^(?:season|temporada|s|t)\s*0*(\d+)\b[\s.\-_]*(.*)$/i);
  if (!match) return null;
  const order = Number(match[1]);
  const rest = (match[2] ?? "").trim();
  return { order, title: rest ? showTitle(rest) : `Temporada ${order}` };
}

function parseFolder(name: string): { order: number; title: string; role: FolderRole; episodeStart: number | null; episodeEnd: number | null } {
  const arc = parseArcName(name);
  if (arc) {
    return {
      order: arc.order,
      title: arc.title,
      role: "arc",
      episodeStart: arc.episodeStart,
      episodeEnd: arc.episodeEnd,
    };
  }
  const saga = parseSagaName(name);
  if (saga) return { order: saga.order, title: saga.title, role: "saga", episodeStart: null, episodeEnd: null };
  const season = parseSeasonName(name);
  if (season) return { order: season.order, title: season.title, role: "season", episodeStart: null, episodeEnd: null };
  const numbered = name.match(/^(\d{1,4})[\s.\-_]+(.+)$/);
  if (numbered) {
    return {
      order: Number(numbered[1]),
      title: showTitle(numbered[2] ?? name),
      role: "folder",
      episodeStart: null,
      episodeEnd: null,
    };
  }
  return { order: 9_999, title: showTitle(name), role: "folder", episodeStart: null, episodeEnd: null };
}

function parseFile(name: string): { number: number; title: string } | null {
  const seasonEp = name.match(/s(\d+)e(\d+)/i);
  if (seasonEp) {
    const number = Number(seasonEp[2]);
    const rest = name.replace(/\.[^.]+$/, "").replace(/s\d+e\d+/i, "").replace(/[-_.\s]+/g, " ").trim();
    return { number, title: rest ? showTitle(rest) : `Episodio ${number}` };
  }
  return parseEpisodeName(name);
}

function formatRange(start: number | null, end: number | null): string | null {
  if (start == null || end == null) return null;
  return `Episodios ${start}–${end}`;
}

function majorityRole(folders: VideoFolderItem[]): FolderRole | null {
  if (!folders.length) return null;
  const counts = { season: 0, saga: 0, arc: 0, folder: 0 };
  for (const folder of folders) counts[folder.role] += 1;
  const winner = (Object.entries(counts) as [FolderRole, number][]).sort((a, b) => b[1] - a[1])[0];
  if (!winner || winner[1] < folders.length / 2) return "folder";
  return winner[0];
}

function roleWord(role: FolderRole, count: number): string {
  if (role === "season") return t(count === 1 ? "videoUi.seasonOne" : "videoUi.seasonMany");
  if (role === "saga") return t(count === 1 ? "videoUi.sagaOne" : "videoUi.sagaMany");
  if (role === "arc") return t(count === 1 ? "videoUi.arcOne" : "videoUi.arcMany");
  return t(count === 1 ? "videoUi.folderOne" : "videoUi.folderMany");
}

function eyebrowFor(path: string, folders: VideoFolderItem[], episodes: VideoEpisodeItem[]): string {
  const role = majorityRole(folders);
  if (role === "season" || role === "saga") return t("videoUi.eyebrowSeries");
  if (role === "arc") return t("videoUi.eyebrowSaga");
  if (/\/movies(\/|$)/i.test(path)) return episodes.length && !folders.length ? t("videoUi.eyebrowMovie") : t("videoUi.eyebrowMovies");
  if (/\/series\/[^/]+$/i.test(path)) return t("videoUi.eyebrowSeries");
  if (parseSeasonName(baseName(path))) return t("videoUi.eyebrowSeason");
  if (episodes.length && !folders.length) return t("videoUi.eyebrowEpisodes");
  return t("videoUi.eyebrowFolder");
}

function skip(entry: WebDavEntry): boolean {
  return SKIP_DIRS.has(entry.name.toLowerCase()) || entry.name.startsWith(".");
}

export async function inspectFolder(
  settings: NasSettings,
  password: string,
  dir: string,
): Promise<VideoListing> {
  const { listDir } = createVideoClient(settings, password);
  const root = dir.replace(/\/+$/, "") || "/";
  const entries = await listDir(root);
  const folders: VideoFolderItem[] = [];
  const episodes: VideoEpisodeItem[] = [];

  for (const entry of entries) {
    if (skip(entry)) continue;
    const path = entry.path.replace(/\/+$/, "");
    if (entry.dir) {
      const parsed = parseFolder(entry.name);
      folders.push({
        id: encodeVideoId(path),
        path,
        title: parsed.title,
        order: parsed.order,
        subtitle: formatRange(parsed.episodeStart, parsed.episodeEnd),
        role: parsed.role,
      });
      continue;
    }
    const parsed = parseFile(entry.name);
    if (!parsed) continue;
    episodes.push({
      id: encodeVideoId(path),
      path,
      title: parsed.title,
      number: parsed.number,
      parentPath: root,
    });
  }

  folders.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, collateLocale()));
  episodes.sort((a, b) => a.number - b.number || a.title.localeCompare(b.title, collateLocale()));

  const role = majorityRole(folders);
  const parts: string[] = [];
  if (folders.length) parts.push(`${folders.length} ${roleWord(role ?? "folder", folders.length)}`);
  if (episodes.length) {
    parts.push(t(episodes.length === 1 ? "videoUi.episodeOne" : "videoUi.episodeMany", { count: episodes.length }));
  }

  return {
    path: root,
    title: showTitle(baseName(root)),
    eyebrow: eyebrowFor(root, folders, episodes),
    summary: parts.join(" · ") || t("videoUi.emptyListing"),
    folders,
    episodes,
  };
}

export function toVideoEpisode(item: VideoEpisodeItem): VideoEpisode {
  return {
    id: item.id,
    path: item.path,
    title: item.title,
    number: item.number,
    arcPath: item.parentPath,
  };
}

export async function collectEpisodes(
  settings: NasSettings,
  password: string,
  path: string,
  depth = 0,
): Promise<VideoEpisode[]> {
  if (depth > MAX_DEPTH) return [];
  const listing = await inspectFolder(settings, password, path);
  const episodes = listing.episodes.map(toVideoEpisode);
  for (const folder of listing.folders) {
    if (episodes.length >= MAX_EPISODES) break;
    episodes.push(...(await collectEpisodes(settings, password, folder.path, depth + 1)));
  }
  return episodes.slice(0, MAX_EPISODES);
}

async function firstEpisode(
  settings: NasSettings,
  password: string,
  path: string,
  depth = 0,
): Promise<VideoEpisode | null> {
  if (depth > MAX_DEPTH) return null;
  const listing = await inspectFolder(settings, password, path);
  if (listing.episodes[0]) return toVideoEpisode(listing.episodes[0]);
  for (const folder of listing.folders) {
    const found = await firstEpisode(settings, password, folder.path, depth + 1);
    if (found) return found;
  }
  return null;
}

function stopAtShare(settings: NasSettings, path: string): boolean {
  const current = path.replace(/\/+$/, "");
  if (isLocalVideoPath(current)) {
    return current === LOCAL_VIDEO_ROOT || current === "/";
  }
  const share = videoShareRoot(settings).toLowerCase();
  const lower = current.toLowerCase();
  return !lower || lower === share || lower === "/" || lower.length < share.length;
}

export async function findNextEpisode(
  settings: NasSettings,
  password: string,
  currentPath: string,
): Promise<VideoEpisode | null> {
  const parent = parentPath(currentPath);
  if (parent) {
    const here = await inspectFolder(settings, password, parent);
    const index = here.episodes.findIndex((item) => item.path === currentPath);
    if (index >= 0 && here.episodes[index + 1]) return toVideoEpisode(here.episodes[index + 1]!);
  }

  let folder = parent;
  while (folder && !stopAtShare(settings, folder)) {
    const above = parentPath(folder);
    if (!above || stopAtShare(settings, above)) break;
    const listing = await inspectFolder(settings, password, above);
    const index = listing.folders.findIndex((item) => item.path === folder);
    for (const next of listing.folders.slice(Math.max(0, index + 1))) {
      const found = await firstEpisode(settings, password, next.path);
      if (found) return found;
    }
    folder = above;
  }
  return null;
}

export function episodeLocation(episodePath: string): {
  arcPath: string;
  sagaPath: string;
  arcTitle: string;
  sagaTitle: string;
} {
  const arcPath = parentPath(episodePath);
  const sagaPath = parentPath(arcPath);
  return {
    arcPath,
    sagaPath,
    arcTitle: showTitle(baseName(arcPath)),
    sagaTitle: showTitle(baseName(sagaPath)),
  };
}
