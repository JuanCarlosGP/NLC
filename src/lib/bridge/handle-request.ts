import { getAlbum, getAlbums, getArtists, getLocalUri, getTracks, loadPlaylists, searchCatalog } from "@/lib/db/catalog";
import type { Album, AlbumDetail, MusicSource, PlayableSource, Track } from "@/lib/nas/types";
import { isPodcastTrack } from "@/lib/nas/webdav";
import { dumpProductivity } from "@/lib/productivity/store";
import { listReminders } from "@/lib/reminders/store";
import { loadNasPassword, loadNasSettings } from "@/lib/settings/storage";
import type { ImportedPlaylist } from "@/lib/spotify/types";
import { inspectFolder } from "@/lib/video/browse";
import { listVideoShows } from "@/lib/video/catalog";
import { createVideoClient } from "@/lib/video/source";
import { createDavTransport } from "@/lib/nas/webdav-source";
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

async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch(() => {
      clearTimeout(timer);
      resolve(fallback);
    });
  });
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

function videoId(path: string): string {
  return path.startsWith("video:") ? path : `video:${path}`;
}

function videoPath(id: string): string {
  const raw = id.startsWith("video:") ? id.slice("video:".length) : id;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function videoTrack(id: string, title: string, albumId: string, albumName: string, artistName: string, track = 0): Track {
  return {
    id,
    title,
    albumId,
    albumName,
    artistId: albumId,
    artistName,
    durationMs: 0,
    track,
    coverId: null,
    artworkUrl: null,
  };
}

function importedAsAlbum(playlist: ImportedPlaylist): Album {
  return {
    id: playlistId(playlist.id),
    name: playlist.name,
    artistId: `playlist-owner:${playlist.ownerName || "me"}`,
    artistName: "",
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

async function videoListing(id: string): Promise<AlbumDetail | null> {
  const dir = videoPath(id);
  const [settings, password] = await Promise.all([loadNasSettings(), loadNasPassword()]);
  const listing = await inspectFolder(settings, password, dir).catch(() => null);
  const name = listing?.title || dir.split("/").filter(Boolean).at(-1) || "Video";
  const albumId = videoId(listing?.path || dir);
  const folderTracks =
    listing?.folders.map((folder, index) =>
      videoTrack(videoId(folder.path), folder.title, albumId, name, "Folder", index + 1),
    ) ?? [];
  const episodeTracks =
    listing?.episodes.map((episode) =>
      videoTrack(videoId(episode.path), episode.title, albumId, name, listing?.eyebrow || "Video", episode.number),
    ) ?? [];
  const tracks = [...folderTracks, ...episodeTracks];
  if (!tracks.length) {
    tracks.push(videoTrack(albumId, name, albumId, name, listing?.eyebrow || "Video", 1));
  }
  return {
    id: albumId,
    name,
    artistId: listing?.path || dir,
    artistName: listing?.eyebrow || "Video",
    year: null,
    coverId: null,
    trackCount: tracks.length,
    tracks,
  };
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
    if (id.startsWith("video:")) {
      const listing = await videoListing(id);
      if (!listing) return { kind: "json", status: 404, body: { error: "missing" } };
      return { kind: "json", status: 200, body: { album: listing } };
    }
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
    if (id.startsWith("video:")) {
      const [settings, password] = await Promise.all([loadNasSettings(), loadNasPassword()]);
      const playable = createVideoClient(settings, password).playable(videoPath(id));
      return { kind: "stream", ...playableParts(await Promise.resolve(playable)) };
    }
    if (id.startsWith("cover:")) {
      const raw = id.slice("cover:".length);
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return { kind: "stream", uri: raw, headers: {} };
      }
      const [settings, password] = await Promise.all([loadNasSettings(), loadNasPassword()]);
      if (settings.sourceKind === "webdav") {
        const { absolute, session } = createDavTransport(settings, password);
        const nasUrl = absolute(raw);
        const auth = session.authorization("GET", nasUrl);
        return { kind: "stream", uri: nasUrl, headers: auth ? { Authorization: auth } : {} };
      }
      const playable = await source.coverUrl(raw);
      return { kind: "stream", uri: playable || "", headers: {} };
    }
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

  if (route === "/v1/video") {
    const id = q.id;
    if (id) {
      const listing = await videoListing(id);
      if (!listing) return { kind: "json", status: 404, body: { error: "missing" } };
      return { kind: "json", status: 200, body: { album: listing } };
    }
    const [settings, password] = await Promise.all([loadNasSettings(), loadNasPassword()]);
    const shows = await withTimeout(listVideoShows(settings, password), 8_000, []);
    const albums: Album[] = shows.map((show) => ({
      id: videoId(show.path),
      name: show.title,
      artistId: show.kind,
      artistName: show.kind === "movie" ? "Movie" : "Series",
      year: null,
      coverId: null,
      trackCount: show.file ? 1 : 0,
    }));
    return { kind: "json", status: 200, body: { albums } };
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
