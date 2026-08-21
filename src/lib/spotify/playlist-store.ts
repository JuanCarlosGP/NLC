import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ImportedPlaylist } from "@/lib/spotify/types";

const KEY = "snd.imported-playlists.v1";

export async function loadImportedPlaylists(): Promise<ImportedPlaylist[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ImportedPlaylist[]) : [];
  } catch {
    return [];
  }
}

export async function saveImportedPlaylists(playlists: ImportedPlaylist[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(playlists));
}

export async function upsertImportedPlaylist(playlist: ImportedPlaylist): Promise<ImportedPlaylist[]> {
  const current = await loadImportedPlaylists();
  const prev = current.find((item) => item.id === playlist.id);
  const merged: ImportedPlaylist = {
    ...playlist,
    liked: playlist.liked ?? prev?.liked,
  };
  const next = [merged, ...current.filter((item) => item.id !== playlist.id)];
  await saveImportedPlaylists(next);
  return next;
}

export async function toggleImportedPlaylistLiked(id: string): Promise<ImportedPlaylist[]> {
  const current = await loadImportedPlaylists();
  const next = current.map((item) => (item.id === id ? { ...item, liked: !item.liked } : item));
  await saveImportedPlaylists(next);
  return next;
}

export async function removeImportedPlaylist(id: string): Promise<ImportedPlaylist[]> {
  const next = (await loadImportedPlaylists()).filter((item) => item.id !== id);
  await saveImportedPlaylists(next);
  return next;
}
