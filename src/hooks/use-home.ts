import { useCallback, useEffect, useState } from "react";
import { catalogTrackCount, getAlbums, getRecents, getTracks } from "@/lib/db/catalog";
import { nasScanOk } from "@/lib/db/from-source";
import { loadRecents, pruneMissingLibraryTracks, subscribeLibraryChanged } from "@/lib/library/cache";
import { hydrateTrackArtworkCache, withTracksArtwork } from "@/lib/library/artwork-cache";
import { persistLibraryCovers } from "@/lib/library/persist-covers";
import type { Album, Track } from "@/lib/nas/types";
import { t } from "@/lib/i18n/runtime";
import { useSettings } from "@/lib/settings/settings-context";

/** Keep last home payload across tab remounts (APK) to avoid skeleton flashes. */
let cachedSourceKind: string | null = null;
let cachedRecents: Track[] = [];
let cachedMusicAlbums: Album[] = [];
let cachedPodcastAlbums: Album[] = [];

export function useHome() {
  const { source, ready, settings } = useSettings();
  const sameSource = cachedSourceKind === settings.sourceKind;
  const [recents, setRecents] = useState<Track[]>(sameSource ? cachedRecents : []);
  const [musicAlbums, setMusicAlbums] = useState<Album[]>(sameSource ? cachedMusicAlbums : []);
  const [podcastAlbums, setPodcastAlbums] = useState<Album[]>(sameSource ? cachedPodcastAlbums : []);
  const [loading, setLoading] = useState(
    !(sameSource && (cachedRecents.length > 0 || cachedMusicAlbums.length > 0 || cachedPodcastAlbums.length > 0)),
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const hasVisibleData =
      cachedSourceKind === settings.sourceKind &&
      (cachedRecents.length > 0 || cachedMusicAlbums.length > 0 || cachedPodcastAlbums.length > 0);
    if (!hasVisibleData) setLoading(true);
    setError(null);
    try {
      const online = await nasScanOk(source);
      const offlineOnly = !online;
      const [recentTracks, nextMusic, nextPodcasts, libraryTracks] = await Promise.all([
        offlineOnly ? getRecents(true) : loadRecents(settings.sourceKind),
        getAlbums({ home: "music", offlineOnly }),
        getAlbums({ home: "podcast", offlineOnly }),
        getTracks({ offlineOnly }),
      ]);
      await hydrateTrackArtworkCache();
      const existingIds = new Set(libraryTracks.map((track) => track.id));
      const prunedRecents =
        !offlineOnly && existingIds.size > 0
          ? await pruneMissingLibraryTracks(existingIds, libraryTracks)
          : recentTracks;
      cachedSourceKind = settings.sourceKind;
      cachedRecents = withTracksArtwork(prunedRecents);
      cachedMusicAlbums = nextMusic;
      cachedPodcastAlbums = nextPodcasts;
      setRecents(cachedRecents);
      setMusicAlbums(nextMusic);
      setPodcastAlbums(nextPodcasts);
      if (online) persistLibraryCovers(source, libraryTracks);
      if (offlineOnly && !(await catalogTrackCount())) {
        setError(t("home.nasOfflineNoCache"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("home.loadError"));
    } finally {
      setLoading(false);
    }
  }, [settings.sourceKind, source]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  useEffect(() => {
    return subscribeLibraryChanged((removedTrackId) => {
      if (removedTrackId) {
        cachedRecents = cachedRecents.filter((track) => track.id !== removedTrackId);
        setRecents(cachedRecents);
      }
      void refresh();
    });
  }, [refresh]);

  return {
    recents,
    musicAlbums,
    podcastAlbums,
    albums: musicAlbums,
    loading,
    error,
    refresh,
    continueTrack: recents[0] ?? null,
  };
}
