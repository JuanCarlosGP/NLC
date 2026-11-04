import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { useZone } from "@/lib/zone/zone-context";
import { isDateKey, localDateKey } from "../weight/model";
import { medicationStore } from "./storage";
import { medicationAlertPermission, medicationAlertsSupported, subscribeMedicationAlerts, syncMedicationAlerts, type MedicationAlertResult } from "./notifications";
import type { DoseInput, MedicationData, PlanInput } from "./model";

type Value = {
  data: MedicationData; ready: boolean; loadFailed: boolean; alerts: MedicationAlertResult; alertError: boolean;
  clearDeviceAlerts(): Promise<void>; refresh(): Promise<void>; savePlan(input: PlanInput, id?: string, active?: boolean): Promise<void>;
  record(input: DoseInput): Promise<void>; setAlerts(enabled: boolean): Promise<boolean>;
};
const Context = createContext<Value | null>(null);
export function MedicationProvider({ children }: { children: ReactNode }) {
  const { setZone } = useZone();
  const [data, setData] = useState<MedicationData>({ plans: [], logs: [], alertsEnabled: false });
  const [ready, setReady] = useState(false); const [loadFailed, setLoadFailed] = useState(false);
  const [alerts, updateAlerts] = useState<MedicationAlertResult>({ count: 0, through: null, permission: false }); const [alertError, setAlertError] = useState(false);
  const revision = useRef(0); const alertQueue = useRef<Promise<void>>(Promise.resolve());
  const refresh = useCallback(async () => {
    const requested = revision.current;
    try { const next = await medicationStore.read(); if (requested === revision.current) { setData(next); setLoadFailed(false); } }
    catch { if (requested === revision.current) setLoadFailed(true); }
    finally { setReady(true); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let previousDate = localDateKey();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    const interval = setInterval(() => { const today = localDateKey(); if (today !== previousDate) { previousDate = today; void refresh(); } }, 30000);
    return () => { sub.remove(); clearInterval(interval); };
  }, [refresh]);
  useEffect(() => subscribeMedicationAlerts((date) => {
    if (!isDateKey(date)) return;
    setZone("health"); router.push({ pathname: "/health/medication", params: { date } });
  }), [setZone]);
  useEffect(() => {
    if (!ready || loadFailed || !medicationAlertsSupported) return;
    let current = true;
    alertQueue.current = alertQueue.current.catch(() => {}).then(async () => {
      try { const result = await syncMedicationAlerts(data); if (current) { updateAlerts(result); setAlertError(false); } }
      catch { if (current) setAlertError(true); }
    });
    return () => { current = false; };
  }, [data, ready, loadFailed]);
  const publish = useCallback((next: MedicationData) => { revision.current += 1; setData(next); setLoadFailed(false); }, []);
  const savePlan = useCallback(async (input: PlanInput, id?: string, active?: boolean) => { publish(await medicationStore.savePlan(input, id, active)); }, [publish]);
  const record = useCallback(async (input: DoseInput) => { publish(await medicationStore.record(input)); }, [publish]);
  const setAlerts = useCallback(async (enabled: boolean) => {
    if (enabled && (!medicationAlertsSupported || !(await medicationAlertPermission(true)))) return false;
    publish(await medicationStore.setAlerts(enabled)); return true;
  }, [publish]);
  const clearDeviceAlerts = useCallback(async () => {
    await alertQueue.current.catch(() => {});
    try { const result = await syncMedicationAlerts({ plans: [], logs: [], alertsEnabled: false }); updateAlerts(result); setAlertError(false); }
    catch (error) { setAlertError(true); throw error; }
  }, []);
  const value = useMemo(() => ({ data, ready, loadFailed, alerts, alertError, clearDeviceAlerts, refresh, savePlan, record, setAlerts }), [data, ready, loadFailed, alerts, alertError, clearDeviceAlerts, refresh, savePlan, record, setAlerts]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMedication(): Value { const value = useContext(Context); if (!value) throw new Error("MedicationProvider missing"); return value; }
