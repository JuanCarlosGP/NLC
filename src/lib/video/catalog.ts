import type { NasSettings } from "@/lib/settings/storage";
import { videoSourceSettings } from "@/lib/settings/storage";
import { createVideoClient } from "@/lib/video/source";
import { listLocalVideoShows } from "@/lib/local/local-video";
import { extOf, toWebDavPath } from "@/lib/nas/webdav";

const SKIP_DIRS = new Set(["storyboards", "@eadir", "#recycle", "#snapshot", ".trash", "lost+found"]);
const VIDEO_EXT = new Set(["mp4", "mkv", "m4v", "webm", "avi", "mov"]);
const KNOWN_TITLES: Record<string, string> = {
  onepiece: "One Piece",
};

export type VideoShow = {
  id: string;
  path: string;
  title: string;
  kind: "series" | "movie";
  file?: boolean;
};

export function videoShareRoot(settings: NasSettings): string {
  return toWebDavPath(videoSourceSettings(settings).sharePath);
}

export function videoSeriesRoot(settings: NasSettings): string {
  return `${videoShareRoot(settings)}/series`;
}

export function videoMoviesRoot(settings: NasSettings): string {
  return `${videoShareRoot(settings)}/movies`;
}

export function encodeVideoPath(path: string): string {
  return encodeURIComponent(path);
}

export function showTitle(folderName: string): string {
  const stem = folderName.replace(/\.[^.]+$/, "");
  return KNOWN_TITLES[stem.toLowerCase()] ?? (humanize(stem) || stem);
}

function humanize(raw: string): string {
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

async function listFolder(
  settings: NasSettings,
  password: string,
  dir: string,
  kind: VideoShow["kind"],
): Promise<VideoShow[]> {
  const { listDir } = createVideoClient(settings, password);
  const entries = await listDir(dir);
  const items: VideoShow[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
    if (entry.dir) {
      const path = entry.path.replace(/\/+$/, "");
      items.push({ id: encodeVideoPath(path), path, title: showTitle(entry.name), kind });
      continue;
    }
    if (kind === "movie" && VIDEO_EXT.has(extOf(entry.name))) {
      const path = entry.path.replace(/\/+$/, "");
      items.push({
        id: encodeVideoPath(path),
        path,
        title: showTitle(entry.name),
        kind,
        file: true,
      });
    }
  }
  return items;
}

export async function listVideoShows(settings: NasSettings, password: string): Promise<VideoShow[]> {
  const [series, movies, local] = await Promise.all([
    listFolder(settings, password, videoSeriesRoot(settings), "series").catch(() => []),
    listFolder(settings, password, videoMoviesRoot(settings), "movie").catch(() => []),
    settings.videoLocalFolderUri
      ? listLocalVideoShows(settings.videoLocalFolderUri)
          .then((items) =>
            items.map((item) => ({
              id: encodeVideoPath(item.path),
              path: item.path,
              title: showTitle(item.name),
              kind: item.kind,
              file: item.file,
            })),
          )
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  return [...series, ...movies, ...local]
    .filter((item) => {
      if (seen.has(item.path)) return false;
      seen.add(item.path);
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title, "es"));
}
