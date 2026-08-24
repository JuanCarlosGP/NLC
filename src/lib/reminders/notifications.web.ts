import type { ProdReminder } from "@/lib/reminders/types";

export async function ensureReminderPermission(_prompt = false): Promise<boolean> {
  return false;
}

export async function syncReminderNotification(_reminder: ProdReminder, _prompt = false): Promise<void> {}

export async function removeReminderNotification(_id: string): Promise<void> {}

export async function syncAllReminderNotifications(_reminders: ProdReminder[]): Promise<void> {}

export function subscribeReminderNotifications(): () => void {
  return () => {};
}
