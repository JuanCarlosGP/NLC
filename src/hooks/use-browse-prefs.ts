import { useCallback, useEffect, useState } from "react";
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

/** Survive tab remounts so grid/list doesn't flash to the default. */
const prefsMemory = new Map<string, BrowsePrefs>();

export function rememberBrowsePrefs(storageKey: string, prefs: BrowsePrefs): void {
  prefsMemory.set(storageKey, prefs);
}

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
  const seed = prefsMemory.get(storageKey) ?? DEFAULT_BROWSE_PREFS;
  const [sort, setSortState] = useState<LibrarySort>(seed.sort);
  const [viewMode, setViewModeState] = useState<BrowseViewMode>(seed.viewMode);
  const [ready, setReady] = useState(prefsMemory.has(storageKey));

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled) return;
        const stored = parseBrowsePrefs(raw);
        prefsMemory.set(storageKey, stored);
        setSortState(stored.sort);
        setViewModeState(stored.viewMode);
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
    const next = { sort, viewMode };
    prefsMemory.set(storageKey, next);
    void AsyncStorage.setItem(storageKey, JSON.stringify(next));
  }, [ready, sort, storageKey, viewMode]);

  const setSort = useCallback((next: LibrarySort) => {
    setSortState(next);
  }, []);

  const setViewMode = useCallback((next: BrowseViewMode) => {
    setViewModeState(next);
  }, []);

  return { sort, viewMode, setSort, setViewMode, ready };
}
