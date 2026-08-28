import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LIBRARY_TAB_KEY } from "@/hooks/use-browse-prefs";
import { catalogTrackCount, getAlbums, getArtists, getTracks } from "@/lib/db/catalog";
import { nasScanOk } from "@/lib/db/from-source";
import { withTracksArtwork } from "@/lib/library/artwork-cache";
import { subscribeLibraryChanged } from "@/lib/library/cache";
import type { Album, Artist, Track } from "@/lib/nas/types";
import { t } from "@/lib/i18n/runtime";
import { useSettings } from "@/lib/settings/settings-context";
import { useZone } from "@/lib/zone/zone-context";

export type LibraryTab = "recents" | "playlists" | "podcasts" | "artists" | "albums" | "tracks";

const TABS: LibraryTab[] = ["recents", "playlists", "podcasts", "artists", "albums", "tracks"];

let tabMemory: LibraryTab | null = null;

export function parseLibraryTab(raw: string | null): LibraryTab {
  return raw && TABS.includes(raw as LibraryTab) ? (raw as LibraryTab) : "recents";
}

export function useLibrary() {
  const { source, ready } = useSettings();
  const { zone } = useZone();
  const trackKind = zone === "podcast" ? "podcast" : "music";
  const [tab, setTabState] = useState<LibraryTab>("recents");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineOnly, setOfflineOnly] = useState(false);

  const setTab = useCallback((next: LibraryTab) => {
    tabMemory = next;
    setTabState(next);
  }, []);

  useEffect(() => {
    tabMemory = tab;
    void AsyncStorage.setItem(LIBRARY_TAB_KEY, tab);
  }, [tab]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const online = await nasScanOk(source);
      const nextOffline = !online;
      setOfflineOnly(nextOffline);
      const [nextArtists, nextAlbums] = await Promise.all([
        getArtists({ offlineOnly: nextOffline }),
        getAlbums({ offlineOnly: nextOffline }),
      ]);
      setArtists(nextArtists);
      setAlbums(nextAlbums);
      setTracks([]);
      if (nextOffline && !(await catalogTrackCount())) {
        setError(t("home.nasOfflineNoCache"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("library.readFail"));
    } finally {
      setLoading(false);
    }
  }, [source]);

  const loadSongs = useCallback(async () => {
    if (tracks.length) return;
    try {
      const songs = await getTracks({ kind: trackKind, offlineOnly });
      setTracks(withTracksArtwork(songs));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("library.listTracksFail"));
    }
  }, [offlineOnly, trackKind, tracks.length]);

  useEffect(() => {
    setTracks([]);
  }, [trackKind]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  useEffect(() => {
    return subscribeLibraryChanged((removedTrackId) => {
      if (removedTrackId) {
        setTracks((current) => current.filter((track) => track.id !== removedTrackId));
      } else {
        setTracks([]);
      }
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    if (tab === "tracks") void loadSongs();
  }, [tab, loadSongs]);

  return { tab, setTab, artists, albums, tracks, loading, error, refresh };
}
