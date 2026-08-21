import { useCallback, useEffect, useMemo, useState } from "react";
import type { Album, Artist } from "@/lib/nas/types";
import { useSettings } from "@/lib/settings/settings-context";

export function useArtist(id: string | undefined) {
  const { source, ready } = useSettings();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [artists, allAlbums] = await Promise.all([source.getArtists(), source.getAlbums()]);
      setArtist(artists.find((item) => item.id === id) ?? null);
      setAlbums(allAlbums.filter((item) => item.artistId === id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el artista.");
    } finally {
      setLoading(false);
    }
  }, [id, source]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  const name = useMemo(() => artist?.name ?? "Artista", [artist]);

  return { artist, albums, loading, error, name };
}
