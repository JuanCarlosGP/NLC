import { useEffect, useState } from "react";
import { getRecents, searchCatalog } from "@/lib/db/catalog";
import { nasScanOk } from "@/lib/db/from-source";
import {
  hydrateTrackArtworkCache,
  subscribeTrackArtwork,
  withTracksArtwork,
} from "@/lib/library/artwork-cache";
import { loadRecents, subscribeLibraryChanged } from "@/lib/library/cache";
import type { SearchResults, Track } from "@/lib/nas/types";
import { usePlayer } from "@/lib/player/player-context";
import { useSettings } from "@/lib/settings/settings-context";

const empty: SearchResults = { artists: [], albums: [], tracks: [] };

export function useSearch(query: string) {
  const { source, ready, settings } = useSettings();
  const { playNonce } = usePlayer();
  const [results, setResults] = useState<SearchResults>(empty);
  const [loading, setLoading] = useState(false);
  const [listTitle, setListTitle] = useState("Recientes");
  const [libraryTick, setLibraryTick] = useState(0);

  useEffect(() => {
    void hydrateTrackArtworkCache();
    const offArt = subscribeTrackArtwork(() => {
      setResults((prev) => ({
        ...prev,
        tracks: withTracksArtwork(prev.tracks),
      }));
    });
    const offLibrary = subscribeLibraryChanged((removedTrackId) => {
      if (removedTrackId) {
        setResults((prev) => ({
          ...prev,
          tracks: prev.tracks.filter((track) => track.id !== removedTrackId),
        }));
      }
      setLibraryTick((value) => value + 1);
    });
    return () => {
      offArt();
      offLibrary();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const q = query.trim();
    let cancelled = false;
    void hydrateTrackArtworkCache();

    const handle = setTimeout(() => {
      void (async () => {
        const online = await nasScanOk(source);
        if (cancelled) return;
        const offlineOnly = !online;

        if (!q) {
          setLoading(true);
          setListTitle("Recientes");
          try {
            const [recentTracks, all] = await Promise.all([
              offlineOnly ? getRecents(true) : loadRecents(settings.sourceKind),
              searchCatalog("*", offlineOnly),
            ]);
            if (cancelled) return;
            setResults({
              artists: [],
              albums: [],
              tracks: withTracksArtwork(orderRecentsFirst(all.tracks, recentTracks)),
            });
          } finally {
            if (!cancelled) setLoading(false);
          }
          return;
        }

        setListTitle("Canciones");
        setLoading(true);
        try {
          const found = await searchCatalog(q, offlineOnly);
          if (!cancelled) {
            setResults({
              artists: found.artists,
              albums: found.albums,
              tracks: withTracksArtwork(found.tracks),
            });
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, q ? 220 : 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [libraryTick, playNonce, query, ready, settings.sourceKind, source]);

  return { results, loading, listTitle };
}

/** Heard tracks first (recents order), then everything else. */
function orderRecentsFirst(all: Track[], recents: Track[]): Track[] {
  const recentIds = new Set(recents.map((track) => track.id));
  const byId = new Map(all.map((track) => [track.id, track]));
  const heard: Track[] = [];
  for (const recent of recents) {
    const track = byId.get(recent.id) ?? recent;
    heard.push(track);
  }
  const rest = all.filter((track) => !recentIds.has(track.id));
  return [...heard, ...rest];
}
