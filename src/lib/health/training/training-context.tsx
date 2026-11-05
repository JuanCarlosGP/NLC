import { onBackendChange, hasRemoteDraft } from "@/lib/backend/remote";
import { onServiceImport } from "@/lib/service-backup/events";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { trainingStore } from "./storage";
import { newSession, repeatSession, validateSession, type TrainingSession, type RestTimer } from "./model";
import { syncRestAlert } from "./notifications";
import { createSessionSaveQueue } from "./save-queue";

type TrainingContextValue = {
  sessions: TrainingSession[]; rest: RestTimer | null; ready: boolean; loadFailed: boolean; status: "saved" | "saving" | "error";
  refresh(): Promise<void>; flush(): Promise<void>;
  create(name: string, date?: string, source?: TrainingSession): Promise<TrainingSession>;
  change(session: TrainingSession): void; remove(id: string): Promise<void>; setRest(timer: RestTimer | null): Promise<void>;
};
const Context = createContext<TrainingContextValue | null>(null);
export function TrainingProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [rest, updateRest] = useState<RestTimer | null>(null);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<TrainingContextValue["status"]>("saved");
  const queue = useRef(createSessionSaveQueue(trainingStore.save)).current;
  const revision = useRef(0);
  const alertWrites = useRef<Promise<void>>(Promise.resolve());
  const syncAlerts = useCallback((timer: RestTimer | null) => {
    const next = alertWrites.current.catch(() => {}).then(() => syncRestAlert(timer));
    alertWrites.current = next; return next;
  }, []);
  const flush = useCallback(async () => {
    setStatus("saving");
    try { await queue.flush(); setStatus(queue.dirty ? "saving" : "saved"); }
    catch (error) { setStatus("error"); throw error; }
  }, [queue]);
  const refresh = useCallback(async () => {
    const requested = ++revision.current;
    try {
      if (queue.dirty) await flush();
      const [rows, timer] = await Promise.all([trainingStore.list(), trainingStore.getRest()]);
      if (requested === revision.current) { setSessions(rows); updateRest(timer); setLoadFailed(false); void syncAlerts(timer).catch(() => {}); }
    } catch { if (requested === revision.current) setLoadFailed(true); }
    finally { setReady(true); }
  }, [flush, queue, syncAlerts]);
  useEffect(() => onBackendChange(domain => { if ((domain === "training" || domain === "*") && !hasRemoteDraft()) void refresh().catch(() => {}); }), [refresh]);

  useEffect(() => onServiceImport(service => { if (service === "health") void refresh().catch(() => {}); }), [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", () => { if (queue.dirty) void flush().catch(() => {}); });
    return () => sub.remove();
  }, [flush, queue]);
  const publish = useCallback((session: TrainingSession) => {
    revision.current += 1;
    setSessions((rows) => [...rows.filter((row) => row.id !== session.id), session].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt));
  }, []);
  const create = useCallback(async (name: string, date?: string, source?: TrainingSession) => {
    const session = source ? repeatSession(source, date) : newSession(name, date);
    await trainingStore.save(session); publish(session); return session;
  }, [publish]);
  const change = useCallback((session: TrainingSession) => {
    const next = validateSession({ ...session, updatedAt: Date.now() });
    publish(next); queue.put(next); void flush().catch(() => {});
  }, [flush, publish, queue]);
  const remove = useCallback(async (id: string) => {
    await flush(); await trainingStore.remove(id); revision.current += 1;
    setSessions((rows) => rows.filter((row) => row.id !== id));
  }, [flush]);
  const restWrites = useRef<Promise<void>>(Promise.resolve());
  const setRest = useCallback((timer: RestTimer | null) => {
    const next = restWrites.current.catch(() => {}).then(async () => {
      await trainingStore.setRest(timer); revision.current += 1; updateRest(timer);
      // Permission is requested only through the explicit alert button.
      await syncAlerts(timer).catch(() => {});
    });
    restWrites.current = next; return next;
  }, [syncAlerts]);
  const value = useMemo(() => ({ sessions, rest, ready, loadFailed, status, refresh, flush, create, change, remove, setRest }),
    [sessions, rest, ready, loadFailed, status, refresh, flush, create, change, remove, setRest]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTraining(): TrainingContextValue {
  const context = useContext(Context); if (!context) throw new Error("TrainingProvider missing"); return context;
}
