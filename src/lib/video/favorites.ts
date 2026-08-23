import AsyncStorage from "@react-native-async-storage/async-storage";
import { encodeVideoPath } from "@/lib/video/catalog";
import { seriesFromPath } from "@/lib/video/browse";
import type { VideoActionsTarget } from "@/lib/video/video-actions-context";

const KEY = "nlc.video.likes.v1";

export type VideoFavorite = {
  id: string;
  path: string;
  title: string;
  kind: "series" | "movie";
  file?: boolean;
};

let memory: VideoFavorite[] = [];
let loaded = false;

function isFavorite(value: unknown): value is VideoFavorite {
  if (!value || typeof value !== "object") return false;
  const row = value as VideoFavorite;
  return Boolean(row.path && row.title && (row.kind === "series" || row.kind === "movie"));
}

export function peekVideoFavorites(): VideoFavorite[] {
  return memory;
}

export function isVideoFavorite(path: string): boolean {
  return memory.some((item) => item.path === path);
}

export async function loadVideoFavorites(): Promise<VideoFavorite[]> {
  if (loaded) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as unknown[]).filter(isFavorite) : [];
  } catch {
    memory = [];
  }
  loaded = true;
  return memory;
}

async function persist() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Keep in-memory likes even if storage is unavailable.
  }
}

function isVideoFilePath(path: string): boolean {
  return /\.(mp4|mkv|m4v|webm|avi|mov)$/i.test(path);
}

export function favoriteFromTarget(target: VideoActionsTarget): VideoFavorite {
  if (target.kind === "folder") {
    const movie = /\/movies\//i.test(target.path) || isVideoFilePath(target.path);
    return {
      id: target.id || encodeVideoPath(target.path),
      path: target.path,
      title: target.title,
      kind: movie ? "movie" : "series",
      file: isVideoFilePath(target.path),
    };
  }
  const series = seriesFromPath(target.episode.path);
  const movie = /\/movies\//i.test(target.episode.path) || isVideoFilePath(series.root);
  return {
    id: encodeVideoPath(series.root),
    path: series.root,
    title: series.title,
    kind: movie ? "movie" : "series",
    file: isVideoFilePath(series.root),
  };
}

export async function toggleVideoFavorite(show: VideoFavorite): Promise<boolean> {
  await loadVideoFavorites();
  const exists = memory.some((item) => item.path === show.path);
  memory = exists
    ? memory.filter((item) => item.path !== show.path)
    : [{ ...show, id: show.id || encodeVideoPath(show.path) }, ...memory];
  await persist();
  return !exists;
}
