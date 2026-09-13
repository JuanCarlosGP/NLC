import { Platform } from "react-native";
import type { Track } from "@/lib/nas/types";
import type { ImportedPlaylist, ImportedTrack, PlaylistKind } from "@/lib/spotify/types";

export const PLAYLISTS_FILE = "nlc-playlists.json";

const PLAYLIST_KINDS = new Set<PlaylistKind>(["playlist", "album", "track", "local"]);

export type PlaylistDumpTrack = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  durationMs: number;
  coverUrl: string | null;
  matchedId: string | null;
};

export type PlaylistDumpItem = {
  id: string;
  kind: PlaylistKind;
  name: string;
  ownerName: string;
  coverUrl: string | null;
  spotifyUrl: string;
  importedAt: number;
  liked?: boolean;
  tracks: PlaylistDumpTrack[];
};

export type PlaylistDump = {
  version: 1;
  updatedAt: number;
  playlists: PlaylistDumpItem[];
};

function asKind(value: unknown): PlaylistKind {
  return typeof value === "string" && PLAYLIST_KINDS.has(value as PlaylistKind)
    ? (value as PlaylistKind)
    : "playlist";
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stubMatched(id: string, track: PlaylistDumpTrack): Track {
  return {
    id,
    title: track.title,
    albumId: id,
    albumName: track.albumName,
    artistId: track.artistName,
    artistName: track.artistName,
    durationMs: track.durationMs,
    artworkUrl: track.coverUrl,
  };
}

function parseDumpTrack(raw: unknown): PlaylistDumpTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<PlaylistDumpTrack>;
  const title = asText(item.title);
  const spotifyId = asText(item.spotifyId);
  if (!title && !spotifyId) return null;
  return {
    spotifyId: spotifyId || title,
    title: title || spotifyId,
    artistName: asText(item.artistName),
    albumName: asText(item.albumName),
    durationMs: asMs(item.durationMs),
    coverUrl: typeof item.coverUrl === "string" && item.coverUrl.trim() ? item.coverUrl : null,
    matchedId: typeof item.matchedId === "string" && item.matchedId.trim() ? item.matchedId : null,
  };
}

function parseDumpItem(raw: unknown): PlaylistDumpItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<PlaylistDumpItem> & { tracks?: unknown };
  const id = asText(item.id);
  const name = asText(item.name);
  if (!id || !name || !Array.isArray(item.tracks)) return null;
  const tracks = item.tracks.map(parseDumpTrack).filter((track): track is PlaylistDumpTrack => Boolean(track));
  return {
    id,
    kind: asKind(item.kind),
    name,
    ownerName: asText(item.ownerName, "NLC"),
    coverUrl: typeof item.coverUrl === "string" && item.coverUrl.trim() ? item.coverUrl : null,
    spotifyUrl: asText(item.spotifyUrl),
    importedAt: asMs(item.importedAt) || Date.now(),
    liked: Boolean(item.liked),
    tracks,
  };
}

export function parsePlaylistDump(raw: string): PlaylistDump | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PlaylistDump>;
    if (parsed.version !== 1 || !Array.isArray(parsed.playlists)) return null;
    const playlists = parsed.playlists
      .map(parseDumpItem)
      .filter((item): item is PlaylistDumpItem => Boolean(item));
    return {
      version: 1,
      updatedAt: asMs(parsed.updatedAt),
      playlists,
    };
  } catch {
    return null;
  }
}

export function playlistToDumpItem(playlist: ImportedPlaylist): PlaylistDumpItem {
  return {
    id: playlist.id,
    kind: playlist.kind ?? "playlist",
    name: playlist.name,
    ownerName: playlist.ownerName,
    coverUrl: playlist.coverUrl,
    spotifyUrl: playlist.spotifyUrl,
    importedAt: playlist.importedAt,
    liked: playlist.liked,
    tracks: playlist.tracks.map((track) => ({
      spotifyId: track.spotifyId,
      title: track.title,
      artistName: track.artistName,
      albumName: track.albumName,
      durationMs: track.durationMs || 0,
      coverUrl: track.coverUrl,
      matchedId: track.matched?.id ?? null,
    })),
  };
}

export function dumpItemToPlaylist(item: PlaylistDumpItem): ImportedPlaylist {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    ownerName: item.ownerName,
    coverUrl: item.coverUrl,
    spotifyUrl: item.spotifyUrl,
    importedAt: item.importedAt,
    liked: item.liked,
    tracks: item.tracks.map((track): ImportedTrack => ({
      spotifyId: track.spotifyId,
      title: track.title,
      artistName: track.artistName,
      albumName: track.albumName,
      durationMs: track.durationMs,
      coverUrl: track.coverUrl,
      matched: track.matchedId ? stubMatched(track.matchedId, track) : null,
    })),
  };
}

function looksLikePlaylistsFile(uri: string): boolean {
  try {
    return decodeURIComponent(uri).toLowerCase().includes(PLAYLISTS_FILE);
  } catch {
    return uri.toLowerCase().includes(PLAYLISTS_FILE);
  }
}

export async function readLocalPlaylistsFile(dirUri: string): Promise<PlaylistDump | null> {
  if (!dirUri || Platform.OS === "web") return null;
  const FileSystem = await import("expo-file-system/legacy");
  const { StorageAccessFramework } = FileSystem;
  try {
    const children = await StorageAccessFramework.readDirectoryAsync(dirUri);
    const uri = children.find((item) => looksLikePlaylistsFile(item));
    if (!uri) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    return parsePlaylistDump(raw);
  } catch {
    return null;
  }
}

export async function writeLocalPlaylistsFile(dirUri: string, dump: PlaylistDump): Promise<void> {
  if (!dirUri || Platform.OS === "web") return;
  const FileSystem = await import("expo-file-system/legacy");
  const { StorageAccessFramework } = FileSystem;
  const children = await StorageAccessFramework.readDirectoryAsync(dirUri);
  let uri = children.find((item) => looksLikePlaylistsFile(item));
  if (!uri) {
    uri = await StorageAccessFramework.createFileAsync(dirUri, PLAYLISTS_FILE, "application/json");
  }
  await FileSystem.writeAsStringAsync(uri, `${JSON.stringify(dump, null, 2)}\n`);
}
