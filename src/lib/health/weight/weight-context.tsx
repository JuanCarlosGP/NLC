import { onBackendChange, hasRemoteDraft } from "@/lib/backend/remote";
import { onServiceImport } from "@/lib/service-backup/events";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sortWeightEntries, type WeightEntry, type WeightInput } from "./model";
import { weightStore } from "./storage";

type WeightContextValue = {
  entries: WeightEntry[];
  ready: boolean;
  loadFailed: boolean;
  refresh(): Promise<void>;
  save(input: WeightInput, originalDate?: string): Promise<void>;
  remove(entryDate: string): Promise<void>;
};

const WeightContext = createContext<WeightContextValue | null>(null);

export function WeightProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const requested = ++revision.current;
    try {
      const rows = await weightStore.list();
      if (requested === revision.current) { setEntries(rows); setLoadFailed(false); }
    } catch {
      if (requested === revision.current) setLoadFailed(true);
    } finally {
      if (requested === revision.current) setReady(true);
    }
  }, []);

  useEffect(() => onBackendChange(domain => { if ((domain === "weight" || domain === "*") && !hasRemoteDraft()) void refresh().catch(() => {}); }), [refresh]);

  useEffect(() => onServiceImport(service => { if (service === "health") void refresh().catch(() => {}); }), [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (input: WeightInput, originalDate?: string) => {
    const entry = await weightStore.save(input, originalDate);
    revision.current += 1;
    setEntries((current) => sortWeightEntries([
      ...current.filter((row) => row.entryDate !== (originalDate ?? entry.entryDate)), entry,
    ]));
  }, []);
  const remove = useCallback(async (entryDate: string) => {
    await weightStore.remove(entryDate);
    revision.current += 1;
    setEntries((current) => current.filter((row) => row.entryDate !== entryDate));
  }, []);
  const value = useMemo(() => ({ entries, ready, loadFailed, refresh, save, remove }), [entries, ready, loadFailed, refresh, save, remove]);
  return <WeightContext.Provider value={value}>{children}</WeightContext.Provider>;
}

export function useWeight(): WeightContextValue {
  const context = useContext(WeightContext);
  if (!context) throw new Error("useWeight must be used within WeightProvider");
  return context;
}
