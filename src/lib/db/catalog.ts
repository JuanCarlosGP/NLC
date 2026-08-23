import { getDb } from "@/lib/db/client";
import { migrateLegacyIfNeeded } from "@/lib/db/migrate-legacy";
import type { Album, AlbumDetail, Artist, SearchResults, Track } from "@/lib/nas/types";
import { isPodcastAlbum, isPodcastTrack, isSongsAlbum, isSongsFolderName } from "@/lib/nas/webdav";
import type { WebDavIndex } from "@/lib/nas/webdav";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";

export type OfflineStatus = "none" | "downloading" | "ready" | "error" | "skipped";
export type OfflineKind = "music" | "podcast" | "video";

export type OfflineItem = Track & {
  kind: OfflineKind;
  localBytes: number;
  nasBytes: number | null;
  offlineStatus: OfflineStatus;
};

type TrackRow = {
  id: string;
  title: string;
  album_id: string;
  album_name: string;
  artist_id: string;
  artist_name: string;
  duration_ms: number;
  track_no: number | null;
  disc: number | null;
  content_type: string | null;
  cover_id: string | null;
  artwork_url: string | null;
  kind: string;
  on_nas: number;
  nas_bytes: number | null;
  local_uri: string | null;
  local_bytes: number | null;
  offline_status: string;
};

const catalogListeners = new Set<() => void>();

export function subscribeCatalog(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
}

export function notifyCatalog(): void {
  for (const listener of catalogListeners) listener();
}

async function ready() {
  const db = await getDb();
  await migrateLegacyIfNeeded(db);
  return db;
}

function asKind(value: string | null | undefined): OfflineKind {
  if (value === "podcast" || value === "video") return value;
  return "music";
}

function rowToTrack(row: TrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    albumId: row.album_id,
    albumName: row.album_name,
    artistId: row.artist_id,
    artistName: row.artist_name,
    durationMs: row.duration_ms || 0,
    track: row.track_no ?? undefined,
    disc: row.disc ?? undefined,
    contentType: row.content_type ?? undefined,
    coverId: row.cover_id,
    artworkUrl: row.artwork_url,
  };
}

function rowToOfflineItem(row: TrackRow): OfflineItem {
  return {
    ...rowToTrack(row),
    kind: asKind(row.kind),
    localBytes: row.local_bytes ?? 0,
    nasBytes: row.nas_bytes,
    offlineStatus: (row.offline_status as OfflineStatus) || "none",
  };
}

function albumKind(album: Album, tracks: Track[]): string {
  if (!isPodcastAlbum(album)) return "music";
  const first = tracks[0];
  if (tracks.length === 1 && first && first.title.trim().toLowerCase() === album.name.trim().toLowerCase()) {
    return "podcast_episode";
  }
  return "podcast_show";
}

export async function replaceLibrary(index: WebDavIndex, sizes?: Map<string, number>): Promise<void> {
  const db = await ready();
  const existing = await db.getAllAsync<{
    id: string;
    local_uri: string | null;
    local_bytes: number | null;
    offline_status: string;
    kind: string;
  }>("SELECT id, local_uri, local_bytes, offline_status, kind FROM tracks");
  const kept = new Map(existing.map((row) => [row.id, row]));
  const seen = new Set<string>();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks WHERE id LIKE 'local%')",
    );
    await db.runAsync(
      "DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks WHERE id LIKE 'local%')",
    );
    for (const artist of index.artists) {
      await db.runAsync(
        `INSERT INTO artists (id, name, album_count, cover_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, album_count = excluded.album_count, cover_id = excluded.cover_id`,
        artist.id,
        artist.name,
        artist.albumCount ?? null,
        artist.coverId ?? null,
      );
    }
    for (const album of index.albums) {
      const tracks = index.albumTracks[album.id] ?? [];
      await db.runAsync(
        `INSERT INTO albums (id, name, artist_id, artist_name, year, cover_id, track_count, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, artist_id = excluded.artist_id, artist_name = excluded.artist_name,
           year = excluded.year, cover_id = excluded.cover_id, track_count = excluded.track_count, kind = excluded.kind`,
        album.id,
        album.name,
        album.artistId,
        album.artistName,
        album.year ?? null,
        album.coverId ?? null,
        album.trackCount ?? tracks.length,
        albumKind(album, tracks),
      );
    }
    for (const track of index.tracks) {
      seen.add(track.id);
      const prev = kept.get(track.id);
      const readyFile = prev?.offline_status === "ready" && prev.local_uri;
      await db.runAsync(
        `INSERT INTO tracks (
          id, title, album_id, album_name, artist_id, artist_name, duration_ms, track_no, disc,
          content_type, cover_id, artwork_url, kind, on_nas, nas_bytes, local_uri, local_bytes, offline_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          album_id = excluded.album_id,
          album_name = excluded.album_name,
          artist_id = excluded.artist_id,
          artist_name = excluded.artist_name,
          duration_ms = excluded.duration_ms,
          track_no = excluded.track_no,
          disc = excluded.disc,
          content_type = excluded.content_type,
          cover_id = excluded.cover_id,
          artwork_url = excluded.artwork_url,
          kind = excluded.kind,
          on_nas = 1,
          nas_bytes = excluded.nas_bytes`,
        track.id,
        track.title,
        track.albumId,
        track.albumName,
        track.artistId,
        track.artistName,
        track.durationMs || 0,
        track.track ?? null,
        track.disc ?? null,
        track.contentType ?? null,
        track.coverId ?? null,
        track.artworkUrl ?? null,
        isPodcastTrack(track) ? "podcast" : "music",
        sizes?.get(track.id) ?? null,
        readyFile ? prev.local_uri : null,
        readyFile ? prev.local_bytes : null,
        readyFile ? "ready" : "none",
      );
    }
    for (const row of existing) {
      if (seen.has(row.id) || row.kind === "video" || row.id.startsWith("local")) continue;
      await db.runAsync("UPDATE tracks SET on_nas = 0 WHERE id = ?", row.id);
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('last_scan_at', ?)",
      String(index.scannedAt || Date.now()),
    );
  });
  notifyCatalog();
}

export async function upsertLocalLibrary(
  index: WebDavIndex,
  locals: Map<string, { uri: string; bytes: number }>,
  prefix = "local:",
): Promise<void> {
  const db = await ready();
  const seen = new Set(index.tracks.map((track) => track.id));
  await db.withTransactionAsync(async () => {
    for (const artist of index.artists) {
      await db.runAsync(
        `INSERT INTO artists (id, name, album_count, cover_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, album_count = excluded.album_count, cover_id = excluded.cover_id`,
        artist.id,
        artist.name,
        artist.albumCount ?? null,
        artist.coverId ?? null,
      );
    }
    for (const album of index.albums) {
      const tracks = index.albumTracks[album.id] ?? [];
      await db.runAsync(
        `INSERT INTO albums (id, name, artist_id, artist_name, year, cover_id, track_count, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, artist_id = excluded.artist_id, artist_name = excluded.artist_name,
           year = excluded.year, cover_id = excluded.cover_id, track_count = excluded.track_count, kind = excluded.kind`,
        album.id,
        album.name,
        album.artistId,
        album.artistName,
        album.year ?? null,
        album.coverId ?? null,
        album.trackCount ?? tracks.length,
        albumKind(album, tracks),
      );
    }
    for (const track of index.tracks) {
      const local = locals.get(track.id);
      await db.runAsync(
        `INSERT INTO tracks (
          id, title, album_id, album_name, artist_id, artist_name, duration_ms, track_no, disc,
          content_type, cover_id, artwork_url, kind, on_nas, nas_bytes, local_uri, local_bytes, offline_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'ready')
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title, album_id = excluded.album_id, album_name = excluded.album_name,
          artist_id = excluded.artist_id, artist_name = excluded.artist_name, kind = excluded.kind,
          on_nas = 1, local_uri = excluded.local_uri, local_bytes = excluded.local_bytes, offline_status = 'ready'`,
        track.id,
        track.title,
        track.albumId,
        track.albumName,
        track.artistId,
        track.artistName,
        track.durationMs || 0,
        track.track ?? null,
        track.disc ?? null,
        track.contentType ?? null,
        track.coverId ?? null,
        track.artworkUrl ?? null,
        isPodcastTrack(track) ? "podcast" : "music",
        local?.bytes ?? null,
        local?.uri ?? track.id.replace(/^local:/, ""),
        local?.bytes ?? 0,
      );
    }
    const previous = await db.getAllAsync<{ id: string }>("SELECT id FROM tracks WHERE id LIKE ?", `${prefix}%`);
    for (const row of previous) {
      if (seen.has(row.id)) continue;
      await db.runAsync("DELETE FROM tracks WHERE id = ?", row.id);
    }
    await db.runAsync("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks)");
    await db.runAsync("DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks)");
  });
  notifyCatalog();
}

export async function clearLocalLibrary(prefix = "local:"): Promise<void> {
  await upsertLocalLibrary(
    { artists: [], albums: [], albumTracks: {}, tracks: [], scannedAt: Date.now() },
    new Map(),
    prefix,
  );
}

export async function getTracks(opts?: { kind?: "music" | "podcast"; offlineOnly?: boolean }): Promise<Track[]> {
  const db = await ready();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts?.kind) {
    where.push("kind = ?");
    params.push(opts.kind);
  }
  if (opts?.offlineOnly) where.push("offline_status = 'ready'");
  const sql = `SELECT * FROM tracks ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY title COLLATE NOCASE`;
  const rows = await db.getAllAsync<TrackRow>(sql, ...params);
  return rows.map(rowToTrack);
}

export async function getAlbums(opts?: {
  home?: "music" | "podcast";
  offlineOnly?: boolean;
}): Promise<Album[]> {
  const db = await ready();
  let rows = await db.getAllAsync<Album & { kind: string }>(
    "SELECT id, name, artist_id as artistId, artist_name as artistName, year, cover_id as coverId, track_count as trackCount, kind FROM albums ORDER BY name COLLATE NOCASE",
  );
  if (opts?.home === "music") {
    rows = rows.filter(
      (album) =>
        album.kind === "music" && !isSongsAlbum(album) && !isSongsFolderName(album.name),
    );
  } else if (opts?.home === "podcast") {
    rows = rows.filter((album) => album.kind === "podcast_show");
  } else {
    rows = rows.filter((album) => album.kind !== "podcast_episode");
  }
  if (opts?.offlineOnly) {
    const readyAlbums = await db.getAllAsync<{ album_id: string }>(
      "SELECT DISTINCT album_id FROM tracks WHERE offline_status = 'ready'",
    );
    const allowed = new Set(readyAlbums.map((row) => row.album_id));
    rows = rows.filter((album) => allowed.has(album.id));
  }
  return rows.map(({ kind: _kind, ...album }) => album);
}

export async function getArtists(opts?: { offlineOnly?: boolean }): Promise<Artist[]> {
  const db = await ready();
  if (opts?.offlineOnly) {
    return db.getAllAsync<Artist>(
      `SELECT DISTINCT a.id, a.name, a.album_count as albumCount, a.cover_id as coverId
       FROM artists a
       INNER JOIN tracks t ON t.artist_id = a.id
       WHERE t.offline_status = 'ready'
       ORDER BY a.name COLLATE NOCASE`,
    );
  }
  return db.getAllAsync<Artist>(
    "SELECT id, name, album_count as albumCount, cover_id as coverId FROM artists ORDER BY name COLLATE NOCASE",
  );
}

export async function getAlbum(id: string, offlineOnly?: boolean): Promise<AlbumDetail | null> {
  const db = await ready();
  const album = await db.getFirstAsync<Album>(
    "SELECT id, name, artist_id as artistId, artist_name as artistName, year, cover_id as coverId, track_count as trackCount FROM albums WHERE id = ?",
    id,
  );
  if (!album) return null;
  const tracks = await db.getAllAsync<TrackRow>(
    offlineOnly
      ? "SELECT * FROM tracks WHERE album_id = ? AND offline_status = 'ready' ORDER BY track_no, title"
      : "SELECT * FROM tracks WHERE album_id = ? ORDER BY track_no, title",
    id,
  );
  return { ...album, tracks: tracks.map(rowToTrack) };
}

export async function searchCatalog(query: string, offlineOnly?: boolean): Promise<SearchResults> {
  const db = await ready();
  const q = query.trim();
  if (!q || q === "*") {
    return {
      artists: await getArtists({ offlineOnly }),
      albums: await getAlbums({ offlineOnly }),
      tracks: await getTracks({ offlineOnly }),
    };
  }
  const like = `%${q.replace(/%/g, "\\%")}%`;
  const trackFilter = offlineOnly ? "AND offline_status = 'ready'" : "";
  const [artists, albums, tracks] = await Promise.all([
    db.getAllAsync<Artist>(
      "SELECT id, name, album_count as albumCount, cover_id as coverId FROM artists WHERE name LIKE ? ESCAPE '\\' ORDER BY name COLLATE NOCASE",
      like,
    ),
    db.getAllAsync<Album & { kind: string }>(
      "SELECT id, name, artist_id as artistId, artist_name as artistName, year, cover_id as coverId, track_count as trackCount, kind FROM albums WHERE (name LIKE ? ESCAPE '\\' OR artist_name LIKE ? ESCAPE '\\') AND kind != 'podcast_episode' ORDER BY name COLLATE NOCASE",
      like,
      like,
    ),
    db.getAllAsync<TrackRow>(
      `SELECT * FROM tracks WHERE (title LIKE ? ESCAPE '\\' OR artist_name LIKE ? ESCAPE '\\' OR album_name LIKE ? ESCAPE '\\') ${trackFilter} ORDER BY title COLLATE NOCASE`,
      like,
      like,
      like,
    ),
  ]);
  if (offlineOnly) {
    const readyArtists = new Set((await getArtists({ offlineOnly: true })).map((item) => item.id));
    const readyAlbums = new Set((await getAlbums({ offlineOnly: true })).map((item) => item.id));
    return {
      artists: artists.filter((item) => readyArtists.has(item.id)),
      albums: albums.map(({ kind: _kind, ...album }) => album).filter((item) => readyAlbums.has(item.id)),
      tracks: tracks.map(rowToTrack),
    };
  }
  return {
    artists,
    albums: albums.map(({ kind: _kind, ...album }) => album),
    tracks: tracks.map(rowToTrack),
  };
}

async function tracksByIds(ids: string[]): Promise<Track[]> {
  if (!ids.length) return [];
  const db = await ready();
  const rows = await db.getAllAsync<TrackRow>(
    `SELECT * FROM tracks WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  const byId = new Map(rows.map((row) => [row.id, rowToTrack(row)]));
  return ids.map((id) => byId.get(id)).filter((track): track is Track => Boolean(track));
}

export async function getRecents(offlineOnly?: boolean): Promise<Track[]> {
  const db = await ready();
  const rows = await db.getAllAsync<{ track_id: string }>("SELECT track_id FROM recents ORDER BY position");
  const tracks = await tracksByIds(rows.map((row) => row.track_id));
  if (!offlineOnly) return tracks;
  const readyRows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM tracks WHERE offline_status = 'ready'",
  );
  const allowed = new Set(readyRows.map((row) => row.id));
  return tracks.filter((track) => allowed.has(track.id));
}

export async function replaceRecents(tracks: Track[]): Promise<void> {
  const db = await ready();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM recents");
    for (const [index, track] of tracks.slice(0, 20).entries()) {
      await upsertTrackSnapshot(db, track);
      await db.runAsync("INSERT INTO recents (position, track_id) VALUES (?, ?)", index, track.id);
    }
  });
  notifyCatalog();
}

export async function pushRecent(track: Track): Promise<Track[]> {
  const current = (await getRecents()).filter((item) => item.id !== track.id);
  const next = [track, ...current].slice(0, 20);
  await replaceRecents(next);
  return next;
}

export async function removeRecent(trackId: string): Promise<Track[]> {
  const next = (await getRecents()).filter((item) => item.id !== trackId);
  await replaceRecents(next);
  return next;
}

export async function getFavorites(): Promise<Track[]> {
  const db = await ready();
  const rows = await db.getAllAsync<{ track_id: string }>("SELECT track_id FROM favorites ORDER BY position");
  return tracksByIds(rows.map((row) => row.track_id));
}

export async function replaceFavorites(tracks: Track[]): Promise<void> {
  const db = await ready();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM favorites");
    for (const [index, track] of tracks.entries()) {
      await upsertTrackSnapshot(db, track);
      await db.runAsync("INSERT INTO favorites (position, track_id) VALUES (?, ?)", index, track.id);
    }
  });
  notifyCatalog();
}

export async function toggleFavorite(track: Track): Promise<Track[]> {
  const current = await getFavorites();
  const exists = current.some((item) => item.id === track.id);
  const next = exists ? current.filter((item) => item.id !== track.id) : [track, ...current];
  await replaceFavorites(next);
  return next;
}

export async function removeFavorite(trackId: string): Promise<Track[]> {
  const next = (await getFavorites()).filter((item) => item.id !== trackId);
  await replaceFavorites(next);
  return next;
}

async function upsertTrackSnapshot(db: Awaited<ReturnType<typeof getDb>>, track: Track): Promise<void> {
  await db.runAsync(
    `INSERT INTO tracks (
      id, title, album_id, album_name, artist_id, artist_name, duration_ms, track_no, disc,
      content_type, cover_id, artwork_url, kind, on_nas
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      album_id = excluded.album_id,
      album_name = excluded.album_name,
      artist_id = excluded.artist_id,
      artist_name = excluded.artist_name,
      duration_ms = excluded.duration_ms,
      cover_id = excluded.cover_id,
      artwork_url = excluded.artwork_url`,
    track.id,
    track.title,
    track.albumId,
    track.albumName,
    track.artistId,
    track.artistName,
    track.durationMs || 0,
    track.track ?? null,
    track.disc ?? null,
    track.contentType ?? null,
    track.coverId ?? null,
    track.artworkUrl ?? null,
    isPodcastTrack(track) ? "podcast" : "music",
  );
}

export async function loadPlaylists(): Promise<ImportedPlaylist[]> {
  const db = await ready();
  const lists = await db.getAllAsync<{
    id: string;
    kind: ImportedPlaylist["kind"];
    name: string;
    owner_name: string;
    cover_url: string | null;
    spotify_url: string;
    imported_at: number;
    liked: number;
  }>("SELECT * FROM playlists ORDER BY imported_at DESC");
  const result: ImportedPlaylist[] = [];
  for (const list of lists) {
    const rows = await db.getAllAsync<{
      spotify_id: string;
      title: string;
      artist_name: string;
      album_name: string;
      duration_ms: number;
      cover_url: string | null;
      matched_id: string | null;
    }>("SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position", list.id);
    const matched = await tracksByIds(rows.map((row) => row.matched_id).filter((id): id is string => Boolean(id)));
    const byId = new Map(matched.map((track) => [track.id, track]));
    result.push({
      id: list.id,
      kind: list.kind,
      name: list.name,
      ownerName: list.owner_name,
      coverUrl: list.cover_url,
      spotifyUrl: list.spotify_url,
      importedAt: list.imported_at,
      liked: Boolean(list.liked),
      tracks: rows.map((row) => ({
        spotifyId: row.spotify_id,
        title: row.title,
        artistName: row.artist_name,
        albumName: row.album_name,
        durationMs: row.duration_ms,
        coverUrl: row.cover_url,
        matched: row.matched_id ? byId.get(row.matched_id) ?? null : null,
      })),
    });
  }
  return result;
}

export async function savePlaylists(playlists: ImportedPlaylist[]): Promise<void> {
  const db = await ready();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM playlist_tracks");
    await db.runAsync("DELETE FROM playlists");
    for (const playlist of playlists) {
      await db.runAsync(
        "INSERT INTO playlists (id, kind, name, owner_name, cover_url, spotify_url, imported_at, liked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        playlist.id,
        playlist.kind,
        playlist.name,
        playlist.ownerName,
        playlist.coverUrl,
        playlist.spotifyUrl,
        playlist.importedAt,
        playlist.liked ? 1 : 0,
      );
      for (const [position, track] of playlist.tracks.entries()) {
        await db.runAsync(
          `INSERT INTO playlist_tracks (
            playlist_id, position, spotify_id, title, artist_name, album_name, duration_ms, cover_url, matched_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          playlist.id,
          position,
          track.spotifyId,
          track.title,
          track.artistName,
          track.albumName,
          track.durationMs || 0,
          track.coverUrl,
          track.matched?.id ?? null,
        );
      }
    }
  });
  notifyCatalog();
}

export async function getLocalUri(trackId: string): Promise<string | null> {
  const db = await ready();
  const row = await db.getFirstAsync<{ local_uri: string | null; offline_status: string }>(
    "SELECT local_uri, offline_status FROM tracks WHERE id = ?",
    trackId,
  );
  if (row?.offline_status === "ready" && row.local_uri) return row.local_uri;
  return null;
}

export async function markDownloading(trackId: string): Promise<void> {
  const db = await ready();
  await db.runAsync("UPDATE tracks SET offline_status = 'downloading' WHERE id = ?", trackId);
}

export async function markReady(trackId: string, uri: string, bytes: number): Promise<void> {
  const db = await ready();
  await db.runAsync(
    "UPDATE tracks SET offline_status = 'ready', local_uri = ?, local_bytes = ? WHERE id = ?",
    uri,
    bytes,
    trackId,
  );
}

export async function markError(trackId: string): Promise<void> {
  const db = await ready();
  await db.runAsync("UPDATE tracks SET offline_status = 'error' WHERE id = ?", trackId);
}

export async function listPendingDownloads(
  includeSkipped = false,
  kind?: OfflineKind,
): Promise<{ id: string; title: string; nasBytes: number | null }[]> {
  if (kind === "video") return [];
  const db = await ready();
  const statuses = includeSkipped ? "('none', 'error', 'skipped')" : "('none', 'error')";
  const kindFilter = kind ? "AND kind = ?" : "AND kind != 'video'";
  return db.getAllAsync(
    `SELECT id, title, nas_bytes as nasBytes FROM tracks
     WHERE on_nas = 1 ${kindFilter} AND id NOT LIKE 'local:%' AND offline_status IN ${statuses}
     ORDER BY title COLLATE NOCASE`,
    ...(kind ? [kind] : []),
  );
}

export async function getOfflineSummary(): Promise<{
  ready: number;
  total: number;
  bytes: number;
  pending: number;
}> {
  const db = await ready();
  const row = await db.getFirstAsync<{ ready: number; total: number; bytes: number; pending: number }>(
    `SELECT
      SUM(CASE WHEN offline_status = 'ready' THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN on_nas = 1 THEN 1 ELSE 0 END) as total,
      SUM(CASE WHEN offline_status = 'ready' THEN COALESCE(local_bytes, 0) ELSE 0 END) as bytes,
      SUM(CASE WHEN on_nas = 1 AND offline_status != 'ready' THEN 1 ELSE 0 END) as pending
     FROM tracks
     WHERE kind != 'video'`,
  );
  return {
    ready: row?.ready ?? 0,
    total: row?.total ?? 0,
    bytes: row?.bytes ?? 0,
    pending: row?.pending ?? 0,
  };
}

export async function getOfflineInventory(): Promise<{ ready: OfflineItem[]; pending: OfflineItem[] }> {
  const db = await ready();
  const [readyRows, pendingRows] = await Promise.all([
    db.getAllAsync<TrackRow>("SELECT * FROM tracks WHERE offline_status = 'ready' ORDER BY title COLLATE NOCASE"),
    db.getAllAsync<TrackRow>(
      "SELECT * FROM tracks WHERE on_nas = 1 AND offline_status != 'ready' ORDER BY title COLLATE NOCASE",
    ),
  ]);
  return { ready: readyRows.map(rowToOfflineItem), pending: pendingRows.map(rowToOfflineItem) };
}

export async function clearLocalCopies(kind?: OfflineKind): Promise<string[]> {
  if (kind === "video") return [];
  const db = await ready();
  const rows = await db.getAllAsync<{ local_uri: string }>(
    kind
      ? "SELECT local_uri FROM tracks WHERE local_uri IS NOT NULL AND kind = ?"
      : "SELECT local_uri FROM tracks WHERE local_uri IS NOT NULL AND kind != 'video'",
    ...(kind ? [kind] : []),
  );
  if (kind) {
    await db.runAsync(
      "UPDATE tracks SET local_uri = NULL, local_bytes = NULL, offline_status = 'skipped' WHERE local_uri IS NOT NULL AND kind = ?",
      kind,
    );
  } else {
    await db.runAsync(
      "UPDATE tracks SET local_uri = NULL, local_bytes = NULL, offline_status = 'skipped' WHERE local_uri IS NOT NULL AND kind != 'video'",
    );
  }
  notifyCatalog();
  return rows.map((row) => row.local_uri);
}

export async function clearLocalCopy(trackId: string): Promise<string | null> {
  const db = await ready();
  const row = await db.getFirstAsync<{ local_uri: string | null }>(
    "SELECT local_uri FROM tracks WHERE id = ?",
    trackId,
  );
  await db.runAsync(
    "UPDATE tracks SET local_uri = NULL, local_bytes = NULL, offline_status = 'skipped' WHERE id = ?",
    trackId,
  );
  notifyCatalog();
  return row?.local_uri ?? null;
}

export async function upsertVideoTracks(
  items: { path: string; title: string; number: number; albumId: string; albumName: string }[],
): Promise<void> {
  const db = await ready();
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO tracks (
          id, title, album_id, album_name, artist_id, artist_name, duration_ms, track_no,
          kind, on_nas, offline_status
        ) VALUES (?, ?, ?, ?, 'artist:onepiece', 'One Piece', 0, ?, 'video', 1, 'none')
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          album_id = excluded.album_id,
          album_name = excluded.album_name,
          kind = 'video',
          on_nas = 1`,
        item.path,
        item.title,
        item.albumId,
        item.albumName,
        item.number,
      );
    }
  });
  notifyCatalog();
}

export async function getDownloadMeta(
  ids: string[],
): Promise<{ id: string; title: string; nasBytes: number | null; offlineStatus: string }[]> {
  if (!ids.length) return [];
  const db = await ready();
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    nas_bytes: number | null;
    offline_status: string;
  }>(
    `SELECT id, title, nas_bytes, offline_status FROM tracks WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    nasBytes: row.nas_bytes,
    offlineStatus: row.offline_status,
  }));
}

export async function catalogTrackCount(): Promise<number> {
  const db = await ready();
  const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) as n FROM tracks");
  return row?.n ?? 0;
}

export async function renameTrackTitle(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  const db = await ready();
  await db.runAsync("UPDATE tracks SET title = ? WHERE id = ?", trimmed, id);
  notifyCatalog();
}

export async function renameAlbumName(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const db = await ready();
  await db.runAsync("UPDATE albums SET name = ? WHERE id = ?", trimmed, id);
  await db.runAsync("UPDATE tracks SET album_name = ? WHERE album_id = ?", trimmed, id);
  notifyCatalog();
}

export async function renameArtistName(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const db = await ready();
  await db.runAsync("UPDATE artists SET name = ? WHERE id = ?", trimmed, id);
  await db.runAsync("UPDATE albums SET artist_name = ? WHERE artist_id = ?", trimmed, id);
  await db.runAsync("UPDATE tracks SET artist_name = ? WHERE artist_id = ?", trimmed, id);
  notifyCatalog();
}

export async function retargetCatalogPath(from: string, to: string): Promise<void> {
  if (!from || !to || from === to) return;
  const db = await ready();
  const tracks = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM tracks WHERE id = ? OR id LIKE ?",
    from,
    `${from}/%`,
  );
  for (const row of tracks) {
    const next = row.id === from ? to : `${to}${row.id.slice(from.length)}`;
    await db.runAsync("UPDATE tracks SET id = ? WHERE id = ?", next, row.id);
  }
  const albums = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM albums WHERE id = ? OR id LIKE ?",
    from,
    `${from}/%`,
  );
  for (const row of albums) {
    const next = row.id === from ? to : `${to}${row.id.slice(from.length)}`;
    await db.runAsync("UPDATE albums SET id = ? WHERE id = ?", next, row.id);
    await db.runAsync("UPDATE tracks SET album_id = ? WHERE album_id = ?", next, row.id);
  }
  const artists = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM artists WHERE id = ? OR id LIKE ?",
    from,
    `${from}/%`,
  );
  for (const row of artists) {
    const next = row.id === from ? to : `${to}${row.id.slice(from.length)}`;
    await db.runAsync("UPDATE artists SET id = ? WHERE id = ?", next, row.id);
    await db.runAsync("UPDATE albums SET artist_id = ? WHERE artist_id = ?", next, row.id);
    await db.runAsync("UPDATE tracks SET artist_id = ? WHERE artist_id = ?", next, row.id);
  }
  const matches = await db.getAllAsync<{ playlist_id: string; position: number; matched_id: string }>(
    "SELECT playlist_id, position, matched_id FROM playlist_tracks WHERE matched_id = ? OR matched_id LIKE ?",
    from,
    `${from}/%`,
  );
  for (const row of matches) {
    const next = row.matched_id === from ? to : `${to}${row.matched_id.slice(from.length)}`;
    await db.runAsync(
      "UPDATE playlist_tracks SET matched_id = ? WHERE playlist_id = ? AND position = ?",
      next,
      row.playlist_id,
      row.position,
    );
  }
  notifyCatalog();
}
