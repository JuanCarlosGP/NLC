import type { CatalogDb } from "../../db/types";
import { makeDoseLog, medicationId, newMedicationPlan, revisePlan, validateLog, validatePlan, type MedicationData, type MedicationPlan, type DoseLog, type DoseInput, type PlanInput } from "./model";
import { localDateKey } from "../weight/model";

export type MedicationPersistence = {
  read(): Promise<MedicationData>;
  savePlan(plan: MedicationPlan, data: MedicationData): Promise<void>;
  saveLog(log: DoseLog, data: MedicationData): Promise<void>;
  setAlerts(data: MedicationData): Promise<void>;
};
export function validateMedicationData(data: MedicationData): MedicationData {
  if (!data || !Array.isArray(data.plans) || !Array.isArray(data.logs) || typeof data.alertsEnabled !== "boolean") throw new Error("Invalid medication storage");
  data.plans.forEach(validatePlan); data.logs.forEach(validateLog);
  if (new Set(data.plans.map((plan) => plan.id)).size !== data.plans.length || new Set(data.logs.map((log) => log.id)).size !== data.logs.length || data.logs.some((log) => !data.plans.some((plan) => plan.id === log.planId))) throw new Error("Invalid medication relationships");
  return data;
}
export function createMedicationStore(persistence: MedicationPersistence, now = () => Date.now()) {
  let pending: Promise<unknown> = Promise.resolve();
  function write(task: () => Promise<MedicationData>) { const next = pending.then(task); pending = next.catch(() => {}); return next; }
  async function read() { return validateMedicationData(await persistence.read()); }
  return {
    async read() { await pending; return read(); },
    savePlan(input: PlanInput, id?: string, active = true) {
      const newId = id ?? medicationId();
      return write(async () => {
        const data = await read(); const existing = id ? data.plans.find((plan) => plan.id === id) : null;
        if (id && !existing) throw new Error("Medication plan missing");
        const timestamp = now();
        const plan = existing ? revisePlan(existing, input, active, localDateKey(new Date(timestamp)), timestamp) : newMedicationPlan(input, timestamp, newId);
        const next = { ...data, plans: [...data.plans.filter((row) => row.id !== plan.id), plan] };
        await persistence.savePlan(plan, next); return next;
      });
    },
    record(input: DoseInput) {
      return write(async () => {
        const data = await read(); const log = makeDoseLog(data, input, now());
        const next = { ...data, logs: [...data.logs.filter((row) => row.id !== log.id), log] };
        await persistence.saveLog(log, next); return next;
      });
    },
    setAlerts(enabled: boolean) {
      return write(async () => { const data = await read(); const next = { ...data, alertsEnabled: enabled }; await persistence.setAlerts(next); return next; });
    },
  };
}
export type MedicationStore = ReturnType<typeof createMedicationStore>;
export function createSqlMedicationStore(open: () => Promise<CatalogDb>, now = () => Date.now()): MedicationStore {
  return createMedicationStore({
    async read() {
      const db = await open();
      const plans = await db.getAllAsync<{ payload: string }>("SELECT payload FROM health_medication_plans ORDER BY updated_at DESC");
      const logs = await db.getAllAsync<{ payload: string }>("SELECT payload FROM health_medication_logs ORDER BY entry_date DESC");
      const settings = await db.getFirstAsync<{ alerts_enabled: number }>("SELECT alerts_enabled FROM health_medication_settings WHERE id = 1");
      return { plans: plans.map((row) => JSON.parse(row.payload)), logs: logs.map((row) => JSON.parse(row.payload)), alertsEnabled: settings?.alerts_enabled === 1 };
    },
    async savePlan(plan) {
      const db = await open(); await db.runAsync(`INSERT INTO health_medication_plans (id, updated_at, payload) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`, plan.id, plan.updatedAt, JSON.stringify(plan));
    },
    async saveLog(log) {
      const db = await open(); await db.runAsync(`INSERT INTO health_medication_logs (id, plan_id, entry_date, payload) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`, log.id, log.planId, log.date, JSON.stringify(log));
    },
    async setAlerts(data) {
      const db = await open(); await db.runAsync("INSERT OR REPLACE INTO health_medication_settings (id, alerts_enabled) VALUES (1, ?)", data.alertsEnabled ? 1 : 0);
    },
  }, now);
}
