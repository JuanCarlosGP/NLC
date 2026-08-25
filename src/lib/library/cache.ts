import {
  getAlbums,
  getArtists,
  getFavorites,
  getRecents,
  notifyCatalog,
  pushRecent as catalogPushRecent,
  removeFavorite as catalogRemoveFavorite,
  removeRecent as catalogRemoveRecent,
  replaceFavorites as catalogReplaceFavorites,
  replaceRecents as catalogReplaceRecents,
  subscribeCatalog,
  toggleFavorite as catalogToggleFavorite,
} from "@/lib/db/catalog";
import { withTrackArtwork } from "@/lib/library/artwork-cache";
import type { Album, Artist, MusicSourceKind, Track } from "@/lib/nas/types";
import { isPodcastTrack } from "@/lib/nas/webdav";

export type LibraryCache = {
  sourceKind: string;
  artists: Artist[];
  albums: Album[];
  updatedAt: number;
};

export async function loadLibraryCache(): Promise<LibraryCache | null> {
  const [artists, albums] = await Promise.all([getArtists(), getAlbums()]);
  if (!artists.length && !albums.length) return null;
  return { sourceKind: "webdav", artists, albums, updatedAt: Date.now() };
}

export async function saveLibraryCache(_cache: LibraryCache): Promise<void> {
  // El catálogo SQLite se actualiza en el scan WebDAV.
}

export async function loadRecents(_sourceKind?: MusicSourceKind): Promise<Track[]> {
  return getRecents();
}

export async function pushRecent(track: Track): Promise<Track[]> {
  return catalogPushRecent(withTrackArtwork(track));
}

export async function loadFavorites(_sourceKind?: MusicSourceKind): Promise<Track[]> {
  return getFavorites();
}

export async function replaceRecents(tracks: Track[]): Promise<void> {
  await catalogReplaceRecents(tracks);
}

export async function replaceFavorites(tracks: Track[]): Promise<void> {
  await catalogReplaceFavorites(tracks);
}

export async function toggleFavorite(track: Track): Promise<Track[]> {
  return catalogToggleFavorite(track);
}

export async function removeFavorite(trackId: string): Promise<Track[]> {
  return catalogRemoveFavorite(trackId);
}

export async function removeRecent(trackId: string): Promise<Track[]> {
  return catalogRemoveRecent(trackId);
}

function sameTrackMeta(a: Track, b: Track): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.artistName === b.artistName &&
    a.albumId === b.albumId &&
    a.albumName === b.albumName &&
    a.coverId === b.coverId &&
    a.artworkUrl === b.artworkUrl &&
    a.durationMs === b.durationMs
  );
}

export function hydrateTracksFromLibrary(stored: Track[], libraryTracks: Track[]): Track[] {
  const byId = new Map(libraryTracks.map((track) => [track.id, track]));
  const next: Track[] = [];
  for (const track of stored) {
    const fresh = byId.get(track.id);
    if (!fresh) continue;
    if (isPodcastTrack(fresh) || isPodcastTrack(track)) {
      next.push({ ...fresh, artworkUrl: null, durationMs: fresh.durationMs || track.durationMs || 0 });
      continue;
    }
    next.push({
      ...fresh,
      artworkUrl:
        fresh.artworkUrl || (fresh.coverId === track.coverId ? track.artworkUrl : null) || null,
      durationMs: fresh.durationMs || track.durationMs || 0,
    });
  }
  return next;
}

export async function pruneMissingLibraryTracks(
  existingIds: Set<string>,
  libraryTracks?: Track[],
): Promise<Track[]> {
  const [recents, favorites] = await Promise.all([getRecents(), getFavorites()]);
  const keepRecents = recents.filter((track) => existingIds.has(track.id));
  const keepFavorites = favorites.filter((track) => existingIds.has(track.id));
  const nextRecents = libraryTracks ? hydrateTracksFromLibrary(keepRecents, libraryTracks) : keepRecents;
  const nextFavorites = libraryTracks ? hydrateTracksFromLibrary(keepFavorites, libraryTracks) : keepFavorites;
  const recentsChanged =
    nextRecents.length !== recents.length || nextRecents.some((track, index) => !sameTrackMeta(track, recents[index]!));
  const favoritesChanged =
    nextFavorites.length !== favorites.length ||
    nextFavorites.some((track, index) => !sameTrackMeta(track, favorites[index]!));
  if (recentsChanged) await catalogReplaceRecents(nextRecents);
  if (favoritesChanged) await catalogReplaceFavorites(nextFavorites);
  return nextRecents;
}

export function subscribeLibraryChanged(listener: (removedTrackId?: string) => void): () => void {
  return subscribeCatalog(() => listener());
}

export function notifyLibraryChanged(removedTrackId?: string): void {
  notifyCatalog();
  void removedTrackId;
}

export async function clearLibraryCache(_removedTrackId?: string): Promise<void> {
  notifyCatalog();
}
