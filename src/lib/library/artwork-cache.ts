import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Track } from "@/lib/nas/types";
import { isPodcastTrack } from "@/lib/nas/webdav";
import type { ImportedPlaylist } from "@/lib/spotify/types";

const KEY = "snd.track-meta.v2";
const LEGACY_ARTWORK_KEY = "snd.track-artwork.v1";

type TrackMeta = {
  artworkUrl?: string;
  durationMs?: number;
};

type MetaMap = Record<string, TrackMeta>;

let memory: MetaMap = {};
let loaded = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeTrackArtwork(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTrackArtworkUrl(trackId: string): string | null {
  return memory[trackId]?.artworkUrl ?? null;
}

export function getTrackDurationMs(trackId: string): number {
  return memory[trackId]?.durationMs ?? 0;
}

export function withTrackArtwork<T extends Track>(track: T): T {
  if (isPodcastTrack(track)) {
    if (!track.artworkUrl) return track;
    return { ...track, artworkUrl: null };
  }
  const meta = memory[track.id];
  if (!meta) return track;
  const artworkUrl = track.artworkUrl || meta.artworkUrl || null;
  const durationMs = track.durationMs || meta.durationMs || 0;
  if (artworkUrl === track.artworkUrl && durationMs === track.durationMs) return track;
  return { ...track, artworkUrl, durationMs };
}

export function withTracksArtwork<T extends Track>(tracks: T[]): T[] {
  return tracks.map(withTrackArtwork);
}

async function persist(): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(memory));
}

export async function hydrateTrackArtworkCache(): Promise<MetaMap> {
  if (loaded) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      memory = JSON.parse(raw) as MetaMap;
    } else {
      const legacy = await AsyncStorage.getItem(LEGACY_ARTWORK_KEY);
      if (legacy) {
        const old = JSON.parse(legacy) as Record<string, string>;
        memory = Object.fromEntries(
          Object.entries(old).map(([id, artworkUrl]) => [id, { artworkUrl }]),
        );
        await persist();
      } else {
        memory = {};
      }
    }
  } catch {
    memory = {};
  }
  loaded = true;
  notify();
  return memory;
}

export async function rememberTrackArtwork(
  entries: Array<{ trackId: string; url?: string; durationMs?: number }>,
): Promise<void> {
  if (!entries.length) return;
  await hydrateTrackArtworkCache();
  let changed = false;
  for (const entry of entries) {
    if (!entry.trackId) continue;
    const prev = memory[entry.trackId] ?? {};
    const next: TrackMeta = { ...prev };
    let entryChanged = false;
    if (entry.url?.trim() && entry.url.trim() !== prev.artworkUrl) {
      next.artworkUrl = entry.url.trim();
      entryChanged = true;
    }
    if (entry.durationMs && entry.durationMs > 0 && entry.durationMs !== prev.durationMs) {
      next.durationMs = entry.durationMs;
      entryChanged = true;
    }
    if (entryChanged) {
      memory[entry.trackId] = next;
      changed = true;
    }
  }
  if (!changed) return;
  await persist();
  notify();
}

/** Pull Spotify covers + durations from matched playlist tracks. */
export async function syncArtworkFromPlaylists(playlists: ImportedPlaylist[]): Promise<void> {
  const entries: Array<{ trackId: string; url?: string; durationMs?: number }> = [];
  for (const playlist of playlists) {
    for (const track of playlist.tracks) {
      if (!track.matched?.id) continue;
      const url = track.coverUrl || playlist.coverUrl || undefined;
      const durationMs = track.durationMs || track.matched.durationMs || undefined;
      if (url || durationMs) {
        entries.push({ trackId: track.matched.id, url, durationMs });
      }
    }
  }
  await rememberTrackArtwork(entries);
}
