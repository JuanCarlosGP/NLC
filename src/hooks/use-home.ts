import { useCallback, useEffect, useState } from "react";
import { loadRecents, pruneMissingLibraryTracks } from "@/lib/library/cache";
import { hydrateTrackArtworkCache, withTracksArtwork } from "@/lib/library/artwork-cache";
import type { Album, Track } from "@/lib/nas/types";
import { isPodcastAlbum, isSongsAlbum } from "@/lib/nas/webdav";
import { useSettings } from "@/lib/settings/settings-context";

/** Keep last home payload across tab remounts (APK) to avoid skeleton flashes. */
let cachedSourceKind: string | null = null;
let cachedRecents: Track[] = [];
let cachedMusicAlbums: Album[] = [];
let cachedPodcastAlbums: Album[] = [];

function musicAlbumsForHome(all: Album[]): Album[] {
  return all.filter((album) => !isPodcastAlbum(album) && !isSongsAlbum(album)).slice(0, 8);
}

function podcastAlbumsForHome(all: Album[]): Album[] {
  return all.filter(isPodcastAlbum).slice(0, 8);
}

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
      const [recentTracks, allAlbums, library] = await Promise.all([
        loadRecents(settings.sourceKind),
        source.getAlbums(),
        source.search("*").catch(() => ({ tracks: [] as Track[] })),
      ]);
      await hydrateTrackArtworkCache();
      const existingIds = new Set(library.tracks.map((track) => track.id));
      const prunedRecents =
        existingIds.size > 0 ? await pruneMissingLibraryTracks(existingIds) : recentTracks;
      const nextMusic = musicAlbumsForHome(allAlbums);
      const nextPodcasts = podcastAlbumsForHome(allAlbums);
      cachedSourceKind = settings.sourceKind;
      cachedRecents = withTracksArtwork(prunedRecents);
      cachedMusicAlbums = nextMusic;
      cachedPodcastAlbums = nextPodcasts;
      setRecents(cachedRecents);
      setMusicAlbums(nextMusic);
      setPodcastAlbums(nextPodcasts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el inicio.");
    } finally {
      setLoading(false);
    }
  }, [settings.sourceKind, source]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

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
