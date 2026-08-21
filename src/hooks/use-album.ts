import { useCallback, useEffect, useState } from "react";
import type { AlbumDetail } from "@/lib/nas/types";
import { useSettings } from "@/lib/settings/settings-context";

export function useAlbum(id: string | undefined) {
  const { source, ready } = useSettings();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setAlbum(await source.getAlbum(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el álbum.");
    } finally {
      setLoading(false);
    }
  }, [id, source]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  return { album, loading, error };
}
