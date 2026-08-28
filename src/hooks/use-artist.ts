import { useCallback, useEffect, useMemo, useState } from "react";
import { getAlbums, getArtists } from "@/lib/db/catalog";
import { nasScanOk } from "@/lib/db/from-source";
import type { Album, Artist } from "@/lib/nas/types";
import { t } from "@/lib/i18n/runtime";
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
      const offlineOnly = !(await nasScanOk(source));
      const [artists, allAlbums] = await Promise.all([
        getArtists({ offlineOnly }),
        getAlbums({ offlineOnly }),
      ]);
      setArtist(artists.find((item) => item.id === id) ?? null);
      setAlbums(allAlbums.filter((item) => item.artistId === id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("artist.openError"));
    } finally {
      setLoading(false);
    }
  }, [id, source]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  const name = useMemo(() => artist?.name ?? t("library.artist"), [artist]);

  return { artist, albums, loading, error, name };
}
