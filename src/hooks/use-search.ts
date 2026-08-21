import { useEffect, useState } from "react";
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
    if (!ready) return;
    const q = query.trim();
    let cancelled = false;

    if (!q) {
      void (async () => {
        const recentTracks = await loadRecents(settings.sourceKind);
        if (cancelled) return;
        if (recentTracks.length) {
          setLoading(false);
          setListTitle("Recientes");
          setResults({ artists: [], albums: [], tracks: recentTracks });
          return;
        }
        setLoading(true);
        try {
          const tracks = await fallbackTracks();
          if (!cancelled) {
            setListTitle("Canciones");
            setResults({ artists: [], albums: [], tracks });
          }
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
              tracks: remote.tracks,
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

    async function fallbackTracks(): Promise<Track[]> {
      try {
        const searched = await source.search("*");
        if (searched.tracks.length) return searched.tracks.slice(0, 20);
      } catch {
        // Sigue con álbumes.
      }
      const collected: Track[] = [];
      try {
        const albums = await source.getAlbums();
        for (const album of albums.slice(0, 8)) {
          collected.push(...(await source.getTracks(album.id)));
          if (collected.length >= 20) break;
        }
      } catch {
        return collected;
      }
      return collected.slice(0, 20);
    }
  }, [playNonce, query, ready, settings.sourceKind, source]);

  return { results, loading, listTitle };
}

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) map.set(item.id, item);
  return [...map.values()];
}
