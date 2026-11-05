import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend } from "@/lib/backend/remote";
import type { RestTimer } from "./model";
export const restAlertsSupported = remoteEnabled;
export async function restAlertPermission(_prompt = false): Promise<boolean> { return remoteEnabled ? browserBackend.invoke("notifications.permission", [], { domain: "notifications" }) : false; }
export async function syncRestAlert(_timer: RestTimer | null): Promise<void> {}
