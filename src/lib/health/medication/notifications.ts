import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { ensureReminderPermission, REMINDER_CHANNEL } from "@/lib/reminders/notifications";
import { t } from "@/lib/i18n/runtime";
import { upcomingMedicationAlerts, type MedicationData } from "./model";

export const medicationAlertsSupported = true;
export const medicationAlertPermission = ensureReminderPermission;
export type MedicationAlertResult = { count: number; through: string | null; permission: boolean };
export async function syncMedicationAlerts(data: MedicationData): Promise<MedicationAlertResult> {
  const current = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(current.filter((item) => item.content.data?.kind === "medication").map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  const permission = data.alertsEnabled && await medicationAlertPermission(false);
  const alerts = permission ? upcomingMedicationAlerts(data) : [];
  for (const alert of alerts) {
    await Notifications.scheduleNotificationAsync({ identifier: alert.id,
      content: { title: t("medication.title"), body: t("medication.notificationBody"), sound: "default", data: { kind: "medication", date: alert.date } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(alert.at), channelId: Platform.OS === "android" ? REMINDER_CHANNEL : undefined },
    });
  }
  return { count: alerts.length, through: alerts.at(-1)?.date ?? null, permission };
}
export function subscribeMedicationAlerts(open: (date: string) => void): () => void {
  const receive = (notification: Notifications.NotificationResponse | null) => {
    const data = notification?.notification.request.content.data;
    if (data?.kind !== "medication" || typeof data.date !== "string") return;
    Notifications.clearLastNotificationResponse(); open(data.date);
  };
  const sub = Notifications.addNotificationResponseReceivedListener(receive);
  void Notifications.getLastNotificationResponseAsync().then(receive).catch(() => {});
  return () => sub.remove();
}
