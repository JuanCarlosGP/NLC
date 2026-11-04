import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { ensureReminderPermission, REMINDER_CHANNEL } from "@/lib/reminders/notifications";
import { t } from "@/lib/i18n/runtime";
import type { RestTimer } from "./model";
const REST_ID = "training-rest";
export const restAlertsSupported = true;
export const restAlertPermission = ensureReminderPermission;
export async function syncRestAlert(timer: RestTimer | null): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REST_ID);
  if (!timer || timer.endsAt <= Date.now() || !(await restAlertPermission(false))) return;
  await Notifications.scheduleNotificationAsync({ identifier: REST_ID,
    content: { title: t("training.restOver"), body: t("training.nextSet", { exercise: timer.exerciseName }), sound: "default", data: { kind: "training-rest" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(timer.endsAt), channelId: Platform.OS === "android" ? REMINDER_CHANNEL : undefined },
  });
}
