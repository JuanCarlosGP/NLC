import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { episodeLocation, findNextEpisode, seriesFromPath } from "@/lib/video/browse";
import {
  loadWatchHistory,
  peekWatchHistory,
  type VideoWatchEntry,
} from "@/lib/video/watch-history";
import { useSettings } from "@/lib/settings/settings-context";

export type VideoContinueRow = {
  last: VideoWatchEntry;
  next: VideoWatchEntry | null;
};

const nextCache = new Map<string, VideoWatchEntry | null>();

function toContinueItem(
  episode: { path: string; number: number; title: string },
): VideoWatchEntry {
  const location = episodeLocation(episode.path);
  const series = seriesFromPath(episode.path);
  return {
    seriesId: series.id,
    seriesTitle: series.title,
    path: episode.path,
    number: episode.number,
    title: episode.title,
    positionSec: 0,
    durationSec: 0,
    watchedAt: 0,
    ...location,
  };
}

export function useVideoContinue() {
  const { settings, password, ready } = useSettings();
  const [rows, setRows] = useState<VideoContinueRow[]>(() =>
    peekWatchHistory().map((last) => ({ last, next: nextCache.get(last.path) ?? null })),
  );
  const [loading, setLoading] = useState(!peekWatchHistory().length);

  const refresh = useCallback(async () => {
    const history = await loadWatchHistory();
    setRows(
      history.map((last) => ({
        last,
        next: nextCache.has(last.path) ? (nextCache.get(last.path) ?? null) : null,
      })),
    );
    setLoading(false);
    if (!history.length) return;

    const resolved = await Promise.all(
      history.map(async (last) => {
        if (nextCache.has(last.path)) {
          return { last, next: nextCache.get(last.path) ?? null };
        }
        try {
          const found = await findNextEpisode(settings, password, last.path);
          const next = found ? toContinueItem(found) : null;
          nextCache.set(last.path, next);
          return { last, next };
        } catch {
          return { last, next: nextCache.get(last.path) ?? null };
        }
      }),
    );
    setRows(resolved);
  }, [password, settings]);

  useFocusEffect(
    useCallback(() => {
      if (ready) void refresh();
    }, [ready, refresh]),
  );

  return {
    rows,
    last: rows[0]?.last ?? null,
    next: rows[0]?.next ?? null,
    loading,
    refresh,
  };
}
