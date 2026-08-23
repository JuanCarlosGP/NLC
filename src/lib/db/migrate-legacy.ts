import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CatalogDb } from "@/lib/db/types";
import type { Track } from "@/lib/nas/types";
import { isPodcastTrack } from "@/lib/nas/webdav";
import type { ImportedPlaylist } from "@/lib/spotify/types";

const FLAG = "snd.catalog.migrated.v1";
const RECENTS_KEY = "snd.recents.v1";
const FAVORITES_KEY = "snd.favorites.v1";
const PLAYLISTS_KEY = "snd.imported-playlists.v1";

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function upsertTrack(db: CatalogDb, track: Track): Promise<void> {
  await db.runAsync(
    `INSERT INTO tracks (
      id, title, album_id, album_name, artist_id, artist_name, duration_ms, track_no, disc,
      content_type, cover_id, artwork_url, kind, on_nas
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      album_name = excluded.album_name,
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

let migrated = false;

export async function migrateLegacyIfNeeded(db: CatalogDb): Promise<void> {
  if (migrated) return;
  const done = await AsyncStorage.getItem(FLAG);
  if (done) {
    migrated = true;
    return;
  }

  const [recents, favorites, playlists] = await Promise.all([
    readJson<Track[]>(RECENTS_KEY, []),
    readJson<Track[]>(FAVORITES_KEY, []),
    readJson<ImportedPlaylist[]>(PLAYLISTS_KEY, []),
  ]);

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM recents");
    await db.runAsync("DELETE FROM favorites");
    await db.runAsync("DELETE FROM playlist_tracks");
    await db.runAsync("DELETE FROM playlists");

    for (const [index, track] of recents.slice(0, 20).entries()) {
      await upsertTrack(db, track);
      await db.runAsync("INSERT INTO recents (position, track_id) VALUES (?, ?)", index, track.id);
    }
    for (const [index, track] of favorites.entries()) {
      await upsertTrack(db, track);
      await db.runAsync("INSERT INTO favorites (position, track_id) VALUES (?, ?)", index, track.id);
    }
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

  await AsyncStorage.setItem(FLAG, "1");
  migrated = true;
}
