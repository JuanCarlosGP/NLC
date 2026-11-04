import { createMedicationStore, validateMedicationData } from "./store";
import type { MedicationData } from "./model";
export const MEDICATION_WEB_KEY = "nlc.health.medication.v1";
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export function createWebMedicationStore(storage: Storage) {
  const save = (_: unknown, data: MedicationData) => storage.setItem(MEDICATION_WEB_KEY, JSON.stringify(data));
  return createMedicationStore({
    async read() { const raw = await storage.getItem(MEDICATION_WEB_KEY); return raw === null ? { plans: [], logs: [], alertsEnabled: false } : validateMedicationData(JSON.parse(raw)); },
    savePlan: save, saveLog: save, setAlerts: (data) => save(null, data),
  });
}
