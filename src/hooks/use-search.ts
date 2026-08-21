import { useEffect, useState } from "react";
import {
  hydrateTrackArtworkCache,
  subscribeTrackArtwork,
  withTracksArtwork,
} from "@/lib/library/artwork-cache";
import { loadLibraryCache, loadRecents } from "@/lib/library/cache";
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

  useEffect(() => {
    void hydrateTrackArtworkCache();
    return subscribeTrackArtwork(() => {
      setResults((prev) => ({
        ...prev,
        tracks: withTracksArtwork(prev.tracks),
      }));
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const q = query.trim();
    let cancelled = false;
    void hydrateTrackArtworkCache();

    if (!q) {
      void (async () => {
        setLoading(true);
        setListTitle("Recientes");
        try {
          const [recentTracks, allTracks] = await Promise.all([
            loadRecents(settings.sourceKind),
            loadAllTracks(),
          ]);
          if (cancelled) return;
          setResults({
            artists: [],
            albums: [],
            tracks: withTracksArtwork(orderRecentsFirst(allTracks, recentTracks)),
          });
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setListTitle("Canciones");
    const handle = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const cached = await loadLibraryCache();
          const local: SearchResults = {
            artists: cached?.artists.filter((item) => item.name.toLowerCase().includes(q.toLowerCase())) ?? [],
            albums:
              cached?.albums.filter(
                (item) =>
                  item.name.toLowerCase().includes(q.toLowerCase()) ||
                  item.artistName.toLowerCase().includes(q.toLowerCase()),
              ) ?? [],
            tracks: [],
          };
          if (!cancelled) setResults(local);
          const remote = await source.search(q);
          if (!cancelled) {
            setResults({
              artists: mergeById(local.artists, remote.artists),
              albums: mergeById(local.albums, remote.albums),
              tracks: withTracksArtwork(remote.tracks),
            });
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };

    async function loadAllTracks(): Promise<Track[]> {
      try {
        const searched = await source.search("*");
        if (searched.tracks.length) return searched.tracks;
      } catch {
        // Fallback por álbumes.
      }
      const collected: Track[] = [];
      const seen = new Set<string>();
      try {
        const albums = await source.getAlbums();
        for (const album of albums) {
          const albumTracks = await source.getTracks(album.id);
          for (const track of albumTracks) {
            if (seen.has(track.id)) continue;
            seen.add(track.id);
            collected.push(track);
          }
        }
      } catch {
        return collected;
      }
      return collected;
    }
  }, [playNonce, query, ready, settings.sourceKind, source]);

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

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) map.set(item.id, item);
  return [...map.values()];
}
