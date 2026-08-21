import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadFavorites, toggleFavorite as persistToggle } from "@/lib/library/cache";
import type { Track } from "@/lib/nas/types";
import { useSettings } from "@/lib/settings/settings-context";

type FavoritesContextValue = {
  favorites: Track[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (track: Track) => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { ready, settings } = useSettings();
  const [favorites, setFavorites] = useState<Track[]>([]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void loadFavorites(settings.sourceKind)
      .then((stored) => {
        if (!cancelled) setFavorites(stored);
      })
      .catch(() => {
        if (!cancelled) setFavorites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, settings.sourceKind]);

  const isFavorite = useCallback((id: string) => favorites.some((item) => item.id === id), [favorites]);

  const toggleFavorite = useCallback(async (track: Track) => {
    const next = await persistToggle(track);
    setFavorites(next);
  }, []);

  const value = useMemo(
    () => ({ favorites, isFavorite, toggleFavorite }),
    [favorites, isFavorite, toggleFavorite],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
