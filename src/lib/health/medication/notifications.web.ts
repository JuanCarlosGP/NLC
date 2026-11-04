import type { MedicationData } from "./model";
export type MedicationAlertResult = { count: number; through: string | null; permission: boolean };
export const medicationAlertsSupported = false;
export async function medicationAlertPermission(_prompt = false): Promise<boolean> { return false; }
export async function syncMedicationAlerts(_data: MedicationData): Promise<MedicationAlertResult> { return { count: 0, through: null, permission: false }; }
export function subscribeMedicationAlerts(_open: (date: string) => void): () => void { return () => {}; }
