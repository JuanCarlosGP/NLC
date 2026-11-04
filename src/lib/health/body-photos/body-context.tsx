import { onServiceImport } from "@/lib/service-backup/events";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bodyStore } from "./storage";
import type { BodyPose, BodyReview, PhotoImport } from "./model";
type Value = {
  entries: BodyReview[]; ready: boolean; loadFailed: boolean; refresh(): Promise<void>;
  save(date: string, note: string, id?: string): Promise<BodyReview>;
  setPhoto(id: string, pose: BodyPose, input: PhotoImport | null): Promise<void>;
  remove(id: string): Promise<void>;
};
const Context = createContext<Value | null>(null);
export function BodyPhotosProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<BodyReview[]>([]); const [ready, setReady] = useState(false); const [loadFailed, setLoadFailed] = useState(false); const revision = useRef(0);
  const refresh = useCallback(async () => {
    const requested = revision.current;
    try { const rows = await bodyStore.list(); if (requested === revision.current) { setEntries(rows); setLoadFailed(false); } }
    catch { if (requested === revision.current) setLoadFailed(true); }
    finally { setReady(true); }
  }, []);
  useEffect(() => onServiceImport(service => { if (service === "health") void refresh().catch(() => {}); }), [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);
  const publish = useCallback((rows: BodyReview[]) => { revision.current += 1; setEntries(rows); setLoadFailed(false); }, []);
  const save = useCallback(async (date: string, note: string, id?: string) => {
    const rows = await bodyStore.save(date, note, id); publish(rows); return rows.find((entry) => id ? entry.id === id : entry.date === date)!;
  }, [publish]);
  const setPhoto = useCallback(async (id: string, pose: BodyPose, input: PhotoImport | null) => { publish(await bodyStore.setPhoto(id, pose, input)); }, [publish]);
  const remove = useCallback(async (id: string) => { publish(await bodyStore.remove(id)); }, [publish]);
  const value = useMemo(() => ({ entries, ready, loadFailed, refresh, save, setPhoto, remove }), [entries, ready, loadFailed, refresh, save, setPhoto, remove]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useBodyPhotos(): Value { const value = useContext(Context); if (!value) throw new Error("BodyPhotosProvider missing"); return value; }
