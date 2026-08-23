import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { upsertLocalLibrary } from "@/lib/db/catalog";
import type { Album, AlbumDetail, Artist, MusicSource, PingResult, PlayableSource, SearchResults } from "@/lib/nas/types";
import {
  buildIndex,
  emptyIndex,
  isAudioFile,
  isCoverFile,
  isImageFile,
  isPodcastFolderName,
  sidecarKeys,
  type WebDavEntry,
  type WebDavIndex,
} from "@/lib/nas/webdav";
import { getWebDirectoryHandle } from "@/lib/local/pick-folder";

const ROOT = "localroot";

export type LocalSourceOptions = {
  asPodcast?: boolean;
  idPrefix?: string;
  skipPodcasts?: boolean;
};

function playableId(uri: string, prefix: string): string {
  return uri.startsWith(`${prefix}:`) ? uri : `${prefix}:${uri}`;
}

function rawUri(trackId: string): string {
  return trackId.replace(/^localpod:/, "").replace(/^local:/, "");
}

function nameFromUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const tail = decoded.split("/").pop() ?? decoded;
    return tail.replace(/^.*:/, "") || "archivo";
  } catch {
    return "archivo";
  }
}

async function walkNative(
  uri: string,
  relative: string,
  files: WebDavEntry[],
  covers: Map<string, string>,
  sidecars: Map<string, string>,
  depth: number,
  prefix: string,
  skipPodcasts: boolean,
): Promise<void> {
  if (depth > 8 || files.length > 8000) return;
  const { StorageAccessFramework } = FileSystem;
  let children: string[] = [];
  try {
    children = await StorageAccessFramework.readDirectoryAsync(uri);
  } catch {
    return;
  }
  for (const child of children) {
    if (files.length > 8000) return;
    const name = nameFromUri(child);
    if (skipPodcasts && !relative && isPodcastFolderName(name)) continue;
    const rel = relative ? `${relative}/${name}` : name;
    const knownFile = isAudioFile(name) || isCoverFile(name) || isImageFile(name);
    if (!knownFile) {
      try {
        await StorageAccessFramework.readDirectoryAsync(child);
        await walkNative(child, rel, files, covers, sidecars, depth + 1, prefix, skipPodcasts);
        continue;
      } catch {
        // Not a folder we can open — skip unknown files.
      }
    }
    const path = `${ROOT}/${rel}`;
    if (isCoverFile(name)) {
      const parent = path.replace(/\/[^/]+$/, "") || ROOT;
      if (!covers.has(parent)) covers.set(parent, child);
      continue;
    }
    if (isImageFile(name)) {
      for (const key of sidecarKeys(path)) {
        if (!sidecars.has(key)) sidecars.set(key, child);
      }
      continue;
    }
    if (isAudioFile(name)) {
      files.push({
        path,
        name,
        dir: false,
        size: 0,
        uri: playableId(child, prefix),
      });
    }
  }
}

async function walkWeb(
  handle: { name: string; kind: string; values: () => AsyncIterable<any> },
  relative: string,
  files: WebDavEntry[],
  covers: Map<string, string>,
  sidecars: Map<string, string>,
  urls: Map<string, string>,
  depth: number,
  prefix: string,
  skipPodcasts: boolean,
): Promise<void> {
  if (depth > 8 || files.length > 8000) return;
  for await (const entry of handle.values()) {
    const name = entry.name;
    if (skipPodcasts && !relative && isPodcastFolderName(name)) continue;
    const rel = relative ? `${relative}/${name}` : name;
    if (entry.kind === "directory") {
      await walkWeb(entry, rel, files, covers, sidecars, urls, depth + 1, prefix, skipPodcasts);
      continue;
    }
    const path = `${ROOT}/${rel}`;
    if (isCoverFile(name)) continue;
    if (isImageFile(name)) continue;
    if (!isAudioFile(name)) continue;
    const file = await entry.getFile?.();
    if (!file) continue;
    const blobUrl = URL.createObjectURL(file);
    const id = playableId(`web:${rel}`, prefix);
    urls.set(id, blobUrl);
    files.push({ path, name, dir: false, size: file.size, uri: id });
  }
}

export function createLocalSource(folderUri: string, options: LocalSourceOptions = {}): MusicSource {
  const prefix = options.idPrefix ?? "local";
  const asPodcast = Boolean(options.asPodcast);
  const skipPodcasts = Boolean(options.skipPodcasts);
  let index: WebDavIndex | null = null;
  const webUrls = new Map<string, string>();

  async function scan(): Promise<WebDavIndex> {
    if (index) return index;
    const files: WebDavEntry[] = [];
    const covers = new Map<string, string>();
    const sidecars = new Map<string, string>();
    if (Platform.OS === "web") {
      const handle = getWebDirectoryHandle(folderUri);
      if (handle) await walkWeb(handle, "", files, covers, sidecars, webUrls, 0, prefix, skipPodcasts);
    } else if (folderUri) {
      await walkNative(folderUri, "", files, covers, sidecars, 0, prefix, skipPodcasts);
    }
    const next = files.length
      ? buildIndex(ROOT, files, covers, sidecars, asPodcast ? ROOT : "")
      : emptyIndex();
    const locals = new Map<string, { uri: string; bytes: number }>();
    for (const file of files) {
      if (!file.uri) continue;
      locals.set(file.uri, {
        uri: Platform.OS === "web" ? (webUrls.get(file.uri) ?? rawUri(file.uri)) : rawUri(file.uri),
        bytes: file.size ?? 0,
      });
    }
    await upsertLocalLibrary(next, locals, `${prefix}:`);
    index = next;
    return next;
  }

  function matches(haystack: string, q: string): boolean {
    const blob = haystack.toLowerCase();
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every((token) => blob.includes(token));
  }

  const noun = asPodcast ? "episodios" : "canciones";

  return {
    kind: "local",

    async ping(): Promise<PingResult> {
      try {
        const library = await scan();
        return {
          ok: true,
          message: library.tracks.length
            ? `${library.tracks.length} ${noun} en la carpeta local.`
            : `La carpeta local está vacía o no tiene ${asPodcast ? "episodios" : "audio"}.`,
          serverName: "Carpeta local",
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "No se pudo leer la carpeta local.",
        };
      }
    },

    async getArtists(): Promise<Artist[]> {
      return (await scan()).artists;
    },

    async getAlbums(): Promise<Album[]> {
      return (await scan()).albums;
    },

    async getAlbum(id: string): Promise<AlbumDetail> {
      const library = await scan();
      const album = library.albums.find((item) => item.id === id);
      if (!album) throw new Error("Álbum no encontrado.");
      return { ...album, tracks: library.albumTracks[id] ?? [] };
    },

    async getTracks(albumId: string) {
      return (await this.getAlbum(albumId)).tracks;
    },

    async search(q: string): Promise<SearchResults> {
      const library = await scan();
      if (!q.trim() || q.trim() === "*") {
        return { artists: library.artists, albums: library.albums, tracks: library.tracks };
      }
      return {
        artists: library.artists.filter((item) => matches(item.name, q)),
        albums: library.albums.filter((item) => matches(item.name, q) || matches(item.artistName, q)),
        tracks: library.tracks.filter((item) => matches(`${item.title} ${item.artistName} ${item.albumName}`, q)),
      };
    },

    async streamUrl(trackId: string): Promise<PlayableSource> {
      if (Platform.OS === "web") {
        const url = webUrls.get(trackId);
        if (url) return url;
      }
      return { uri: rawUri(trackId) };
    },

    async coverUrl(id: string): Promise<string | null> {
      return id || null;
    },
  };
}
