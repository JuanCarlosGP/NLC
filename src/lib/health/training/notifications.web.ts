import type { RestTimer } from "./model";
export const restAlertsSupported = false;
export async function restAlertPermission(_prompt = false): Promise<boolean> { return false; }
export async function syncRestAlert(_timer: RestTimer | null): Promise<void> {}
