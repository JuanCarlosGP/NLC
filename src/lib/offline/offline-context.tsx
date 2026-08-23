import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  clearOfflineFiles,
  getOfflineProgress,
  pauseOfflineSync,
  refreshOfflineTotals,
  removeOfflineFile,
  requestOfflineSync,
  resumeOfflineSync,
  setOfflineResolver,
  subscribeOfflineProgress,
  type OfflineProgress,
} from "@/lib/offline/downloader";
import { getOfflineInventory, subscribeCatalog, type OfflineItem, type OfflineKind } from "@/lib/db/catalog";
import { useSettings } from "@/lib/settings/settings-context";

type OfflineContextValue = {
  progress: OfflineProgress;
  readyTracks: OfflineItem[];
  pendingTracks: OfflineItem[];
  start: (kind: OfflineKind) => void;
  pause: () => void;
  clear: (kind: OfflineKind) => Promise<void>;
  remove: (trackId: string) => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { source, ready } = useSettings();
  const [progress, setProgress] = useState(getOfflineProgress);
  const [readyTracks, setReadyTracks] = useState<OfflineItem[]>([]);
  const [pendingTracks, setPendingTracks] = useState<OfflineItem[]>([]);

  useEffect(() => {
    return subscribeOfflineProgress(() => setProgress(getOfflineProgress()));
  }, []);

  useEffect(() => {
    if (!ready) return;
    setOfflineResolver((trackId) => source.streamUrl(trackId));
    return () => setOfflineResolver(null);
  }, [ready, source]);

  const reloadInventory = useCallback(async () => {
    await refreshOfflineTotals();
    const inventory = await getOfflineInventory();
    setReadyTracks(inventory.ready);
    setPendingTracks(inventory.pending);
  }, []);

  useEffect(() => {
    void reloadInventory();
    return subscribeCatalog(() => {
      void reloadInventory();
    });
  }, [reloadInventory]);

  useEffect(() => {
    if (ready) requestOfflineSync();
  }, [ready, source]);

  const value = useMemo<OfflineContextValue>(
    () => ({
      progress,
      readyTracks,
      pendingTracks,
      start: (kind) => resumeOfflineSync(kind),
      pause: pauseOfflineSync,
      clear: async (kind) => {
        await clearOfflineFiles(kind);
        await reloadInventory();
      },
      remove: async (trackId: string) => {
        await removeOfflineFile(trackId);
        await reloadInventory();
      },
    }),
    [pendingTracks, progress, readyTracks, reloadInventory],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used within OfflineProvider");
  return ctx;
}

export type { OfflineItem, OfflineKind };
