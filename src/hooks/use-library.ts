import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LIBRARY_TAB_KEY } from "@/hooks/use-browse-prefs";
import { withTracksArtwork } from "@/lib/library/artwork-cache";
import { loadLibraryCache, saveLibraryCache } from "@/lib/library/cache";
import type { Album, Artist, Track } from "@/lib/nas/types";
import { useSettings } from "@/lib/settings/settings-context";

export type LibraryTab = "recents" | "playlists" | "podcasts" | "artists" | "albums" | "tracks";

const TABS: LibraryTab[] = ["recents", "playlists", "podcasts", "artists", "albums", "tracks"];

let tabMemory: LibraryTab | null = null;

export function parseLibraryTab(raw: string | null): LibraryTab {
  return raw && TABS.includes(raw as LibraryTab) ? (raw as LibraryTab) : "recents";
}

export function useLibrary() {
  const { source, ready, settings } = useSettings();
  const [tab, setTabState] = useState<LibraryTab>(tabMemory ?? "recents");
  const [tabReady, setTabReady] = useState(tabMemory != null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setTab = useCallback((next: LibraryTab) => {
    tabMemory = next;
    setTabState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(LIBRARY_TAB_KEY)
      .then((raw) => {
        if (cancelled) return;
        const next = parseLibraryTab(raw);
        tabMemory = next;
        setTabState(next);
      })
      .finally(() => {
        if (!cancelled) setTabReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tabReady) return;
    tabMemory = tab;
    void AsyncStorage.setItem(LIBRARY_TAB_KEY, tab);
  }, [tab, tabReady]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cached = await loadLibraryCache();
      if (cached && cached.sourceKind === settings.sourceKind) {
        setArtists(cached.artists);
        setAlbums(cached.albums);
      }
      const [nextArtists, nextAlbums] = await Promise.all([source.getArtists(), source.getAlbums()]);
      setArtists(nextArtists);
      setAlbums(nextAlbums);
      await saveLibraryCache({
        sourceKind: settings.sourceKind,
        artists: nextArtists,
        albums: nextAlbums,
        updatedAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la biblioteca.");
    } finally {
      setLoading(false);
    }
  }, [source, settings.sourceKind]);

  const loadSongs = useCallback(async () => {
    if (tracks.length) return;
    try {
      const searched = await source.search("*");
      if (searched.tracks.length) {
        setTracks(withTracksArtwork(searched.tracks));
        return;
      }
      const collected: Track[] = [];
      for (const album of albums.slice(0, 20)) {
        collected.push(...(await source.getTracks(album.id)));
      }
      setTracks(withTracksArtwork(collected));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron listar las canciones.");
    }
  }, [albums, source, tracks.length]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  useEffect(() => {
    if (tab === "tracks") void loadSongs();
  }, [tab, loadSongs]);

  return { tab, setTab, artists, albums, tracks, loading, error, refresh };
}
