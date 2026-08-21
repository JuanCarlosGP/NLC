import AsyncStorage from "@react-native-async-storage/async-storage";
import { withTrackArtwork } from "@/lib/library/artwork-cache";
import { isMockTrack } from "@/lib/nas/mock-source";
import type { Album, Artist, MusicSourceKind, Track } from "@/lib/nas/types";

const CACHE_KEY = "snd.library-cache.v1";
const RECENTS_KEY = "snd.recents.v1";
const FAVORITES_KEY = "snd.favorites.v1";

export type LibraryCache = {
  sourceKind: string;
  artists: Artist[];
  albums: Album[];
  updatedAt: number;
};

export async function loadLibraryCache(): Promise<LibraryCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as LibraryCache) : null;
  } catch {
    return null;
  }
}

export async function saveLibraryCache(cache: LibraryCache): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

async function readTracks(key: string): Promise<Track[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Track[]) : [];
  } catch {
    return [];
  }
}

async function retainForSource(key: string, tracks: Track[], sourceKind?: MusicSourceKind): Promise<Track[]> {
  if (!sourceKind || sourceKind === "mock") return tracks;
  const next = tracks.filter((item) => !isMockTrack(item));
  if (next.length !== tracks.length) {
    await AsyncStorage.setItem(key, JSON.stringify(next));
  }
  return next;
}

export async function loadRecents(sourceKind?: MusicSourceKind): Promise<Track[]> {
  return retainForSource(RECENTS_KEY, await readTracks(RECENTS_KEY), sourceKind);
}

export async function pushRecent(track: Track): Promise<Track[]> {
  const current = await loadRecents();
  const stamped = withTrackArtwork(track);
  const next = [stamped, ...current.filter((item) => item.id !== stamped.id)].slice(0, 20);
  await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  return next;
}

export async function loadFavorites(sourceKind?: MusicSourceKind): Promise<Track[]> {
  return retainForSource(FAVORITES_KEY, await readTracks(FAVORITES_KEY), sourceKind);
}

export async function toggleFavorite(track: Track): Promise<Track[]> {
  const current = await loadFavorites();
  const exists = current.some((item) => item.id === track.id);
  const next = exists ? current.filter((item) => item.id !== track.id) : [track, ...current];
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
}

export async function removeFavorite(trackId: string): Promise<Track[]> {
  const current = await loadFavorites();
  const next = current.filter((item) => item.id !== trackId);
  if (next.length !== current.length) {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }
  return next;
}

export async function removeRecent(trackId: string): Promise<Track[]> {
  const current = await loadRecents();
  const next = current.filter((item) => item.id !== trackId);
  if (next.length !== current.length) {
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  }
  return next;
}

/** Drop recents/favorites whose files are no longer in the NAS index. */
export async function pruneMissingLibraryTracks(existingIds: Set<string>): Promise<Track[]> {
  const [recents, favorites] = await Promise.all([loadRecents(), loadFavorites()]);
  const nextRecents = recents.filter((track) => existingIds.has(track.id));
  const nextFavorites = favorites.filter((track) => existingIds.has(track.id));
  if (nextRecents.length !== recents.length) {
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(nextRecents));
  }
  if (nextFavorites.length !== favorites.length) {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(nextFavorites));
  }
  return nextRecents;
}

export async function clearLibraryCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
