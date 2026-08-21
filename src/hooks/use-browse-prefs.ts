import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LibrarySort } from "@/components/library/library-sort-sheet";

export type BrowseViewMode = "list" | "grid";

export const HOME_BROWSE_KEY = "snd.home.browse.v1";
export const LIBRARY_BROWSE_KEY = "snd.library.browse.v1";
export const LIBRARY_TAB_KEY = "snd.library.tab.v1";

const SORTS: LibrarySort[] = ["recents", "added", "alpha", "creator"];

export type BrowsePrefs = {
  sort: LibrarySort;
  viewMode: BrowseViewMode;
};

export const DEFAULT_BROWSE_PREFS: BrowsePrefs = {
  sort: "recents",
  viewMode: "list",
};

export function parseBrowsePrefs(raw: string | null): BrowsePrefs {
  if (!raw) return { ...DEFAULT_BROWSE_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<BrowsePrefs>;
    return {
      sort: SORTS.includes(parsed.sort as LibrarySort) ? (parsed.sort as LibrarySort) : "recents",
      viewMode: parsed.viewMode === "grid" ? "grid" : "list",
    };
  } catch {
    return { ...DEFAULT_BROWSE_PREFS };
  }
}

export function useBrowsePrefs(storageKey: string) {
  const [sort, setSort] = useState<LibrarySort>(DEFAULT_BROWSE_PREFS.sort);
  const [viewMode, setViewMode] = useState<BrowseViewMode>(DEFAULT_BROWSE_PREFS.viewMode);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled) return;
        const stored = parseBrowsePrefs(raw);
        setSort(stored.sort);
        setViewMode(stored.viewMode);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(storageKey, JSON.stringify({ sort, viewMode }));
  }, [ready, sort, storageKey, viewMode]);

  return { sort, viewMode, setSort, setViewMode };
}
