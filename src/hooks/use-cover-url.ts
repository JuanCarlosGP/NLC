import { useEffect, useState } from "react";
import {
  getTrackArtworkUrl,
  hydrateTrackArtworkCache,
  subscribeTrackArtwork,
} from "@/lib/library/artwork-cache";
import { useSettings } from "@/lib/settings/settings-context";

/** Prefer track.artworkUrl, then Spotify→NAS artwork cache, then NAS coverId. */
export function useTrackArtwork(track?: {
  id?: string;
  coverId?: string | null;
  artworkUrl?: string | null;
} | null): string | null {
  const { source } = useSettings();
  const [uri, setUri] = useState<string | null>(
    track?.artworkUrl || (track?.id ? getTrackArtworkUrl(track.id) : null),
  );
  const [cacheTick, setCacheTick] = useState(0);

  useEffect(() => {
    void hydrateTrackArtworkCache();
    return subscribeTrackArtwork(() => setCacheTick((value) => value + 1));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = track?.id ? getTrackArtworkUrl(track.id) : null;
    const remote = track?.artworkUrl || cached || null;
    if (remote) {
      setUri(remote);
      return;
    }
    if (!track?.coverId) {
      setUri(null);
      return;
    }
    void source.coverUrl(track.coverId).then((next) => {
      if (!cancelled) setUri(next);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheTick, source, track?.artworkUrl, track?.coverId, track?.id]);

  return uri;
}

export function useCoverUrl(coverId?: string | null): string | null {
  const { source } = useSettings();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!coverId) {
      setUri(null);
      return;
    }
    void source.coverUrl(coverId).then((next) => {
      if (!cancelled) setUri(next);
    });
    return () => {
      cancelled = true;
    };
  }, [coverId, source]);

  return uri;
}
