import { useCallback, useEffect, useState } from "react";
import { loadRecents } from "@/lib/library/cache";
import type { Album, Track } from "@/lib/nas/types";
import { useSettings } from "@/lib/settings/settings-context";

export function useHome() {
  const { source, ready, settings } = useSettings();
  const [recents, setRecents] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recentTracks, allAlbums] = await Promise.all([
        loadRecents(settings.sourceKind),
        source.getAlbums(),
      ]);
      setRecents(recentTracks);
      setAlbums(allAlbums.slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el inicio.");
    } finally {
      setLoading(false);
    }
  }, [settings.sourceKind, source]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  return { recents, albums, loading, error, refresh, continueTrack: recents[0] ?? null };
}
