import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { subscribeAssistantMutations } from "@/lib/cursor/assistant-bus";
import {
  loadVideoFavorites,
  peekVideoFavorites,
  toggleVideoFavorite,
  type VideoFavorite,
} from "@/lib/video/favorites";

export function useVideoFavorites() {
  const [favorites, setFavorites] = useState<VideoFavorite[]>(peekVideoFavorites);

  const refresh = useCallback(async () => {
    setFavorites(await loadVideoFavorites());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => subscribeAssistantMutations(() => { void refresh(); }), [refresh]);

  const toggle = useCallback(async (show: VideoFavorite) => {
    await toggleVideoFavorite(show);
    setFavorites(peekVideoFavorites());
  }, []);

  return { favorites, refresh, toggle };
}
