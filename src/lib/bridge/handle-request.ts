import { getAlbum, getAlbums, getArtists, getLocalUri, getTracks, loadPlaylists, searchCatalog } from "@/lib/db/catalog";
import type { Album, AlbumDetail, MusicSource, PlayableSource, Track } from "@/lib/nas/types";
import { isPodcastTrack } from "@/lib/nas/webdav";
import { dumpProductivity } from "@/lib/productivity/store";
import { listReminders } from "@/lib/reminders/store";
import type { ImportedPlaylist } from "@/lib/spotify/types";
import { dumpWealth } from "@/lib/wealth/store";

export type BridgeJson = { status: number; body: unknown };
export type BridgeStream = { uri: string; headers: Record<string, string> };
export type BridgeResult = { kind: "json"; status: number; body: unknown } | { kind: "stream" } & BridgeStream;

function queryMap(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!query) return out;
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
    const value = decodeURIComponent((eq >= 0 ? part.slice(eq + 1) : "").replace(/\+/g, " "));
    out[key] = value;
  }
  return out;
}

function pathId(path: string, prefix: string): string | undefined {
  if (!path.startsWith(prefix)) return undefined;
  const rest = path.slice(prefix.length);
  if (!rest) return undefined;
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

function playableParts(source: PlayableSource): BridgeStream {
  if (typeof source === "string") return { uri: source, headers: {} };
  return { uri: source.uri, headers: source.headers ?? {} };
}

async function first<T>(live: () => Promise<T>, cached: () => Promise<T>): Promise<T> {
  try {
    return await live();
  } catch {
    return cached();
  }
}

async function preferCache<T>(
  cached: () => Promise<T>,
  live: () => Promise<T>,
  isEmpty: (value: T) => boolean,
): Promise<T> {
  try {
    const value = await cached();
    if (!isEmpty(value)) return value;
  } catch {
    // fall through to live
  }
  try {
    return await live();
  } catch {
    return cached();
  }
}

function playlistId(id: string): string {
  return id.startsWith("playlist:") ? id : `playlist:${id}`;
}

function importedAsAlbum(playlist: ImportedPlaylist): Album {
  return {
    id: playlistId(playlist.id),
    name: playlist.name,
    artistId: `playlist-owner:${playlist.ownerName || "me"}`,
    artistName: playlist.ownerName || "Playlist",
    year: playlist.importedAt ? new Date(playlist.importedAt).getFullYear() : null,
    coverId: null,
    trackCount: playlist.tracks.length,
  };
}

function importedAsAlbumDetail(playlist: ImportedPlaylist): AlbumDetail {
  const album = importedAsAlbum(playlist);
  const tracks: Track[] = playlist.tracks.map((track, index) => {
    const matched = track.matched;
    return {
      id: matched?.id ?? `unmatched:${track.spotifyId || index}`,
      title: track.title || matched?.title || "Track",
      albumId: album.id,
      albumName: playlist.name,
      artistId: matched?.artistId || track.artistName,
      artistName: track.artistName || matched?.artistName || "",
      durationMs: track.durationMs || matched?.durationMs || 0,
      track: index + 1,
      coverId: matched?.coverId ?? null,
      artworkUrl: track.coverUrl || matched?.artworkUrl || null,
    };
  });
  return { ...album, tracks };
}

async function importedPlaylistById(id: string): Promise<ImportedPlaylist | undefined> {
  const raw = id.startsWith("playlist:") ? id.slice("playlist:".length) : id;
  const playlists = await loadPlaylists();
  return playlists.find((item) => item.id === raw || playlistId(item.id) === id);
}

export async function handleBridgeRequest(
  source: MusicSource,
  path: string,
  query: string,
): Promise<BridgeResult> {
  const q = queryMap(query);
  const route = path.replace(/\/+$/, "") || "/";

  if (route === "/v1/hello") {
    return { kind: "json", status: 200, body: { ok: true } };
  }

  if (route === "/v1/discover") {
    return { kind: "json", status: 200, body: { ok: true, app: "nlc" } };
  }

  if (route === "/v1/bye") {
    return { kind: "json", status: 200, body: { ok: true } };
  }

  if (route === "/v1/ping") {
    const ping = await source.ping().catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : "ping",
    }));
    return { kind: "json", status: 200, body: { ok: true, nas: ping } };
  }

  if (route === "/v1/artists") {
    const artists = await preferCache(() => getArtists(), () => source.getArtists(), (rows) => rows.length === 0);
    return { kind: "json", status: 200, body: { artists } };
  }

  if (route === "/v1/albums") {
    const albums = await preferCache(() => getAlbums(), () => source.getAlbums(), (rows) => rows.length === 0);
    return { kind: "json", status: 200, body: { albums } };
  }

  if (route === "/v1/playlists") {
    const playlists = await loadPlaylists().catch(() => []);
    return { kind: "json", status: 200, body: { albums: playlists.map(importedAsAlbum) } };
  }

  if (route === "/v1/tracks") {
    const tracks = await preferCache(
      () => getTracks({ kind: "music" }),
      async () => {
        const results = await source.search("*");
        return results.tracks.filter((track) => !isPodcastTrack(track));
      },
      (rows) => rows.length === 0,
    );
    return { kind: "json", status: 200, body: { tracks } };
  }

  if (route === "/v1/album" || route.startsWith("/v1/albums/") || route === "/v1/playlist" || route.startsWith("/v1/playlists/")) {
    const id =
      q.id ||
      pathId(route, "/v1/albums/") ||
      pathId(route, "/v1/album/") ||
      pathId(route, "/v1/playlists/") ||
      pathId(route, "/v1/playlist/");
    if (!id) return { kind: "json", status: 400, body: { error: "missing_id" } };
    if (id.startsWith("playlist:") || route.includes("playlist")) {
      const playlist = await importedPlaylistById(id);
      if (!playlist) return { kind: "json", status: 404, body: { error: "missing" } };
      return { kind: "json", status: 200, body: { album: importedAsAlbumDetail(playlist) } };
    }
    const album = await preferCache(
      async () => {
        const cached = await getAlbum(id);
        if (!cached) throw new Error("missing");
        return cached;
      },
      () => source.getAlbum(id),
      (item) => !item.tracks?.length,
    );
    return { kind: "json", status: 200, body: { album } };
  }

  if (route === "/v1/search") {
    const needle = (q.q ?? q.query ?? "").trim();
    const results = await preferCache(
      () => searchCatalog(needle),
      () => source.search(needle),
      (item) => item.tracks.length === 0 && item.albums.length === 0 && item.artists.length === 0,
    );
    return { kind: "json", status: 200, body: results };
  }

  if (route === "/v1/stream" || route.startsWith("/v1/stream/")) {
    const id = q.id || pathId(route, "/v1/stream/");
    if (!id) return { kind: "json", status: 400, body: { error: "missing_id" } };
    const local = await getLocalUri(id);
    if (local) return { kind: "stream", uri: local, headers: {} };
    const playable = await source.streamUrl(id);
    return { kind: "stream", ...playableParts(playable) };
  }

  if (route === "/v1/cover" || route.startsWith("/v1/cover/")) {
    const id = q.id || pathId(route, "/v1/cover/");
    if (!id) return { kind: "json", status: 400, body: { error: "missing_id" } };
    const url = await source.coverUrl(id);
    if (!url) return { kind: "json", status: 404, body: { error: "no_cover" } };
    return { kind: "json", status: 200, body: { url } };
  }

  if (route === "/v1/focus") {
    const [{ projects, tasks }, reminders] = await Promise.all([dumpProductivity(), listReminders()]);
    return { kind: "json", status: 200, body: { version: 1, projects, tasks, reminders } };
  }

  if (route === "/v1/wealth") {
    const dump = await dumpWealth();
    return { kind: "json", status: 200, body: dump };
  }

  return { kind: "json", status: 404, body: { error: "not_found" } };
}
