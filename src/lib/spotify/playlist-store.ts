import { loadPlaylists, savePlaylists } from "@/lib/db/catalog";
import { getTrackArtworkUrl } from "@/lib/library/artwork-cache";
import type { Track } from "@/lib/nas/types";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";

export async function loadImportedPlaylists(): Promise<ImportedPlaylist[]> {
  return loadPlaylists();
}

export async function saveImportedPlaylists(playlists: ImportedPlaylist[]): Promise<void> {
  await savePlaylists(playlists);
}

export async function upsertImportedPlaylist(playlist: ImportedPlaylist): Promise<ImportedPlaylist[]> {
  const current = await loadPlaylists();
  const prev = current.find((item) => item.id === playlist.id);
  const merged: ImportedPlaylist = {
    ...playlist,
    liked: playlist.liked ?? prev?.liked,
  };
  const next = [merged, ...current.filter((item) => item.id !== playlist.id)];
  await savePlaylists(next);
  return next;
}

export async function renameImportedPlaylist(id: string, name: string): Promise<ImportedPlaylist[]> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("La playlist necesita un nombre.");
  const current = await loadPlaylists();
  const next = current.map((item) => (item.id === id ? { ...item, name: trimmed } : item));
  await savePlaylists(next);
  return next;
}

export async function createEmptyImportedPlaylist(name: string): Promise<ImportedPlaylist[]> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("La playlist necesita un nombre.");
  const playlist: ImportedPlaylist = {
    id: `local-${Date.now()}`,
    kind: "local",
    name: trimmed,
    ownerName: "NLC",
    coverUrl: null,
    spotifyUrl: "",
    importedAt: Date.now(),
    tracks: [],
  };
  return upsertImportedPlaylist(playlist);
}

export async function toggleImportedPlaylistLiked(id: string): Promise<ImportedPlaylist[]> {
  const current = await loadPlaylists();
  const next = current.map((item) => (item.id === id ? { ...item, liked: !item.liked } : item));
  await savePlaylists(next);
  return next;
}

export async function removeImportedPlaylist(id: string): Promise<ImportedPlaylist[]> {
  const next = (await loadPlaylists()).filter((item) => item.id !== id);
  await savePlaylists(next);
  return next;
}

function asImportedTrack(track: Track): ImportedTrack {
  return {
    spotifyId: track.id,
    title: track.title,
    artistName: track.artistName,
    albumName: track.albumName,
    durationMs: track.durationMs,
    coverUrl: track.artworkUrl || getTrackArtworkUrl(track.id) || null,
    matched: track,
  };
}

export async function addTracksToImportedPlaylist(
  id: string,
  tracks: Track[],
): Promise<ImportedPlaylist[]> {
  const current = await loadPlaylists();
  const next = current.map((playlist) => {
    if (playlist.id !== id) return playlist;
    const existing = new Set(playlist.tracks.map((item) => item.matched?.id ?? item.spotifyId));
    const added = tracks.filter((track) => !existing.has(track.id)).map(asImportedTrack);
    if (!added.length) return playlist;
    return {
      ...playlist,
      tracks: [...playlist.tracks, ...added],
      coverUrl: playlist.coverUrl ?? added.find((item) => item.coverUrl)?.coverUrl ?? null,
    };
  });
  await savePlaylists(next);
  return next;
}

export async function removeTrackFromImportedPlaylist(
  id: string,
  trackId: string,
): Promise<ImportedPlaylist[]> {
  const current = await loadPlaylists();
  const next = current.map((playlist) => {
    if (playlist.id !== id) return playlist;
    return {
      ...playlist,
      tracks: playlist.tracks.filter((item) => (item.matched?.id ?? item.spotifyId) !== trackId),
    };
  });
  await savePlaylists(next);
  return next;
}

export async function reorderImportedPlaylistTracks(
  id: string,
  tracks: ImportedTrack[],
): Promise<ImportedPlaylist[]> {
  const current = await loadPlaylists();
  const next = current.map((playlist) => (playlist.id === id ? { ...playlist, tracks } : playlist));
  await savePlaylists(next);
  return next;
}
