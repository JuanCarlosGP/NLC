import { runtimeLocale, t } from "@/lib/i18n/runtime";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";
import {
  youtubeMusicCanonicalUrl,
  youtubeMusicEntityId,
  type ParsedYoutubeMusicUrl,
} from "@/lib/youtube/parse-url";

const EMBED_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function youtubeLang(): { hl: string; gl: string; accept: string } {
  if (runtimeLocale() === "es") {
    return { hl: "es", gl: "ES", accept: "es-ES,es;q=0.9,en;q=0.8" };
  }
  return { hl: "en", gl: "US", accept: "en-US,en;q=0.9" };
}

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (!isJson(value)) return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs
      .map((run) => (isJson(run) && typeof run.text === "string" ? run.text : ""))
      .join("");
  }
  return "";
}

function durationMs(raw: string): number {
  const parts = raw.split(":").map((part) => Number(part));
  if (!parts.length || parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return ((parts[0]! * 60 + parts[1]!) * 60 + parts[2]!) * 1000;
  if (parts.length === 2) return (parts[0]! * 60 + parts[1]!) * 1000;
  return parts[0]! * 1000;
}

function largestThumb(value: unknown): string | null {
  if (!isJson(value)) return null;
  const thumbs = value.thumbnails;
  if (!Array.isArray(thumbs) || !thumbs.length) return null;
  const urls = thumbs
    .map((item) => (isJson(item) && typeof item.url === "string" ? item.url : null))
    .filter((url): url is string => Boolean(url));
  return urls.at(-1) ?? null;
}

function walk(node: unknown, visit: (value: Json) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  const record = node as Json;
  visit(record);
  for (const value of Object.values(record)) walk(value, visit);
}

function bylineParts(raw: string): { artist: string; album: string } {
  const parts = raw
    .split("•")
    .map((part) => part.trim())
    .filter(Boolean);
  return { artist: parts[0] ?? "", album: parts[1] && !/^\d{4}$/.test(parts[1]) ? parts[1] : "" };
}

function fromPanel(renderer: Json, index: number): ImportedTrack | null {
  const title = textOf(renderer.title).trim();
  const videoId = typeof renderer.videoId === "string" ? renderer.videoId : "";
  if (!title) return null;
  const byline = bylineParts(textOf(renderer.shortBylineText) || textOf(renderer.longBylineText));
  return {
    spotifyId: videoId || `ytm-${index}-${title}`,
    title,
    artistName: byline.artist,
    albumName: byline.album,
    durationMs: durationMs(textOf(renderer.lengthText)),
    coverUrl: largestThumb(renderer.thumbnail),
    matched: null,
  };
}

function fromPlaylistVideo(renderer: Json, index: number): ImportedTrack | null {
  const title = textOf(renderer.title).trim();
  const videoId = typeof renderer.videoId === "string" ? renderer.videoId : "";
  if (!title) return null;
  const byline = bylineParts(textOf(renderer.shortBylineText) || textOf(renderer.longBylineText));
  return {
    spotifyId: videoId || `ytm-${index}-${title}`,
    title,
    artistName: byline.artist,
    albumName: byline.album,
    durationMs: durationMs(textOf(renderer.lengthText)),
    coverUrl: largestThumb(renderer.thumbnail),
    matched: null,
  };
}

function fromListItem(renderer: Json, index: number): ImportedTrack | null {
  const columns = Array.isArray(renderer.flexColumns) ? renderer.flexColumns : [];
  const texts = columns.map((column) => {
    if (!isJson(column)) return "";
    const inner = column.musicResponsiveListItemFlexColumnRenderer;
    return isJson(inner) ? textOf(inner.text) : "";
  });
  const title = texts[0]?.trim() ?? "";
  if (!title) return null;
  const byline = bylineParts(texts[1] ?? "");
  const data = isJson(renderer.playlistItemData) ? renderer.playlistItemData : null;
  const videoId = data && typeof data.videoId === "string" ? data.videoId : "";
  const thumbRoot = isJson(renderer.thumbnail) ? renderer.thumbnail.musicThumbnailRenderer : null;
  const thumbs = isJson(thumbRoot) ? thumbRoot.thumbnail : null;
  return {
    spotifyId: videoId || `ytm-${index}-${title}`,
    title,
    artistName: byline.artist,
    albumName: byline.album,
    durationMs: 0,
    coverUrl: largestThumb(thumbs),
    matched: null,
  };
}

function collectTracks(payload: unknown): ImportedTrack[] {
  const tracks: ImportedTrack[] = [];
  const seen = new Set<string>();
  walk(payload, (node) => {
    let track: ImportedTrack | null = null;
    if (isJson(node.playlistPanelVideoRenderer)) {
      track = fromPanel(node.playlistPanelVideoRenderer, tracks.length);
    } else if (isJson(node.playlistVideoRenderer)) {
      track = fromPlaylistVideo(node.playlistVideoRenderer, tracks.length);
    } else if (isJson(node.musicResponsiveListItemRenderer)) {
      track = fromListItem(node.musicResponsiveListItemRenderer, tracks.length);
    }
    if (!track) return;
    const key = track.spotifyId || track.title;
    if (seen.has(key)) return;
    seen.add(key);
    tracks.push(track);
  });
  return tracks.slice(0, 200);
}

function headerTitle(payload: unknown): string {
  let found = "";
  walk(payload, (node) => {
    if (found) return;
    const header =
      (isJson(node.musicDetailHeaderRenderer) && node.musicDetailHeaderRenderer) ||
      (isJson(node.musicResponsiveHeaderRenderer) && node.musicResponsiveHeaderRenderer) ||
      null;
    if (!header) return;
    const title = textOf(header.title).trim();
    if (title) found = title;
  });
  return found;
}

async function innertube(
  endpoint: "next" | "browse",
  extra: Json,
  host: "music.youtube.com" | "www.youtube.com" = "music.youtube.com",
): Promise<unknown> {
  const lang = youtubeLang();
  const context =
    host === "www.youtube.com"
      ? { client: { clientName: "WEB", clientVersion: "2.20250407.00.00", hl: lang.hl, gl: lang.gl } }
      : { client: { clientName: "WEB_REMIX", clientVersion: "1.20250407.01.00", hl: lang.hl, gl: lang.gl } };
  try {
    const response = await fetch(`https://${host}/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": EMBED_UA,
        "Accept-Language": lang.accept,
        Origin: `https://${host}`,
        Referer: `https://${host}/`,
      },
      body: JSON.stringify({ context, ...extra }),
    });
    if (!response.ok) {
      throw new Error(t("nasExtra.youtubeNoList"));
    }
    return response.json();
  } catch (err) {
    if (err instanceof Error && err.message === t("nasExtra.youtubeNoList")) throw err;
    throw new Error(t("nasExtra.youtubePcMetro"));
  }
}

function asPlaylist(
  ref: ParsedYoutubeMusicUrl,
  tracks: ImportedTrack[],
  name: string,
): Omit<ImportedPlaylist, "importedAt"> {
  if (!tracks.length) {
    throw new Error(t("nasExtra.youtubeNoSongs"));
  }
  return {
    id: youtubeMusicEntityId(ref),
    kind: ref.kind === "album" ? "album" : ref.kind === "track" ? "track" : "playlist",
    name,
    ownerName: "YouTube Music",
    coverUrl: tracks.find((track) => track.coverUrl)?.coverUrl ?? null,
    spotifyUrl: youtubeMusicCanonicalUrl(ref),
    tracks,
  };
}

function defaultName(ref: ParsedYoutubeMusicUrl, tracks: ImportedTrack[], header: string): string {
  if (header) return header;
  const first = tracks[0]?.title ?? "YouTube Music";
  if (ref.kind === "radio") return `Mix · ${first}`;
  if (ref.kind === "track") return first;
  if (ref.kind === "album") return tracks[0]?.albumName || first;
  return first;
}

function fromPayload(
  ref: ParsedYoutubeMusicUrl,
  payload: unknown,
): Omit<ImportedPlaylist, "importedAt"> | null {
  const tracks = collectTracks(payload);
  if (!tracks.length) return null;
  return asPlaylist(ref, tracks, defaultName(ref, tracks, headerTitle(payload)));
}

async function tryNext(ref: ParsedYoutubeMusicUrl): Promise<Omit<ImportedPlaylist, "importedAt"> | null> {
  if (!ref.playlistId && !ref.videoId) return null;
  try {
    return fromPayload(
      ref,
      await innertube("next", {
        ...(ref.playlistId ? { playlistId: ref.playlistId } : {}),
        ...(ref.videoId ? { videoId: ref.videoId } : {}),
      }),
    );
  } catch {
    return null;
  }
}

async function tryBrowse(ref: ParsedYoutubeMusicUrl): Promise<Omit<ImportedPlaylist, "importedAt"> | null> {
  const browseId = ref.browseId || (ref.playlistId ? `VL${ref.playlistId}` : "");
  if (!browseId) return null;
  for (const host of ["music.youtube.com", "www.youtube.com"] as const) {
    try {
      const result = fromPayload(ref, await innertube("browse", { browseId }, host));
      if (result) return result;
    } catch {
      // Probar el otro host.
    }
  }
  return null;
}

export async function fetchYoutubeMusicEntity(
  ref: ParsedYoutubeMusicUrl,
): Promise<Omit<ImportedPlaylist, "importedAt">> {
  const order =
    ref.kind === "radio" || ref.kind === "track" ? [tryNext, tryBrowse] : [tryBrowse, tryNext];
  for (const attempt of order) {
    const result = await attempt(ref);
    if (result) return result;
  }
  throw new Error(t("nasExtra.youtubeReadSongsFail"));
}
