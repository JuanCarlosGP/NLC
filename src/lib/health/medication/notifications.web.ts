import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend } from "@/lib/backend/remote";
import type { MedicationData } from "./model";
export type MedicationAlertResult = { count: number; through: string | null; permission: boolean };
export const medicationAlertsSupported = remoteEnabled;
export async function medicationAlertPermission(_prompt = false): Promise<boolean> { return remoteEnabled ? browserBackend.invoke("notifications.permission", [], { domain: "notifications" }) : false; }
export async function syncMedicationAlerts(_data: MedicationData): Promise<MedicationAlertResult> { return remoteEnabled ? browserBackend.invoke("notifications.medication", [], { domain: "notifications" }) : { count: 0, through: null, permission: false }; }
export function subscribeMedicationAlerts(_open: (date: string) => void): () => void { return () => {}; }
