import { useCallback, useEffect, useState } from "react";
import { getAlbum } from "@/lib/db/catalog";
import { nasScanOk } from "@/lib/db/from-source";
import { subscribeLibraryChanged } from "@/lib/library/cache";
import { t } from "@/lib/i18n/runtime";
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
      const online = await nasScanOk(source);
      const local = await getAlbum(id, !online);
      if (local) {
        setAlbum(local);
        return;
      }
      if (online) setAlbum(await source.getAlbum(id));
      else throw new Error(t("album.notOnPhone"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("album.openError"));
    } finally {
      setLoading(false);
    }
  }, [id, source]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  useEffect(() => {
    return subscribeLibraryChanged((removedTrackId) => {
      if (removedTrackId) {
        setAlbum((current) =>
          current
            ? { ...current, tracks: current.tracks.filter((track) => track.id !== removedTrackId) }
            : current,
        );
        return;
      }
      void refresh();
    });
  }, [refresh]);

  return { album, loading, error };
}
