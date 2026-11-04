import { onServiceImport } from "@/lib/service-backup/events";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { nutritionStore } from "./storage";
import type { ImportedDay, NutritionDay, NutritionInput } from "./model";
type Value = { entries: NutritionDay[]; ready: boolean; loadFailed: boolean; refresh(): Promise<void>; save(input: NutritionInput, originalDate?: string): Promise<void>; remove(date: string): Promise<void>; importDays(incoming: ImportedDay[], replace: boolean): ReturnType<typeof nutritionStore.importDays> };
const Context = createContext<Value | null>(null);
export function NutritionProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<NutritionDay[]>([]); const [ready, setReady] = useState(false); const [loadFailed, setLoadFailed] = useState(false); const revision = useRef(0);
  const refresh = useCallback(async () => {
    const requested = revision.current;
    try { const rows = await nutritionStore.list(); if (requested === revision.current) { setEntries(rows); setLoadFailed(false); } }
    catch { if (requested === revision.current) setLoadFailed(true); } finally { setReady(true); }
  }, []);
  useEffect(() => onServiceImport(service => { if (service === "health") void refresh().catch(() => {}); }), [refresh]);

  useEffect(() => { void refresh(); const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); }); return () => subscription.remove(); }, [refresh]);
  const publish = useCallback((rows: NutritionDay[]) => { revision.current++; setEntries(rows); setLoadFailed(false); }, []);
  const save = useCallback(async (input: NutritionInput, originalDate?: string) => { publish(await nutritionStore.save(input, originalDate)); }, [publish]);
  const remove = useCallback(async (date: string) => { publish(await nutritionStore.remove(date)); }, [publish]);
  const importDays = useCallback(async (incoming: ImportedDay[], replace: boolean) => { const result = await nutritionStore.importDays(incoming, replace); publish(result.days); return result; }, [publish]);
  const value = useMemo(() => ({ entries, ready, loadFailed, refresh, save, remove, importDays }), [entries, ready, loadFailed, refresh, save, remove, importDays]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNutrition() { const value = useContext(Context); if (!value) throw new Error("NutritionProvider missing"); return value; }
