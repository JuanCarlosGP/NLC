import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { t } from "@/lib/i18n/runtime";
import { isReminderNotification, openRemindersFromNotification } from "@/lib/reminders/open";
import type { ProdReminder } from "@/lib/reminders/types";

export const REMINDER_CHANNEL = "reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function idsFor(id: string): string[] {
  return [id, `${id}:1`, `${id}:2`, `${id}:3`, `${id}:4`, `${id}:5`, `${id}:6`, `${id}:7`].map(
    (suffix) => `reminder:${suffix}`,
  );
}

function onceDate(reminder: ProdReminder): Date | null {
  if (reminder.frequency !== "once" || reminder.onceAt == null) return null;
  const when = new Date(reminder.onceAt);
  when.setHours(reminder.hour, reminder.minute, 0, 0);
  return when;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: t("reminders.channel"),
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 140, 80, 140],
    lightColor: "#E4D5B8",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function ensureReminderPermission(prompt = false): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;
  if (!prompt) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.status === "granted";
}

async function cancelReminder(id: string): Promise<void> {
  await Promise.all(idsFor(id).map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)));
}

function content(reminder: ProdReminder) {
  return {
    title: reminder.title,
    body: reminder.body.trim() || undefined,
    sound: "default" as const,
    color: "#E4D5B8",
    data: { kind: "reminder", reminderId: reminder.id },
  };
}

async function scheduleOne(
  identifier: string,
  reminder: ProdReminder,
  trigger: Notifications.NotificationTriggerInput,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: content(reminder),
    trigger,
  });
}

export async function syncReminderNotification(reminder: ProdReminder, prompt = false): Promise<void> {
  await cancelReminder(reminder.id);
  if (!reminder.enabled) return;
  if (!(await ensureReminderPermission(prompt))) return;

  const channelId = Platform.OS === "android" ? REMINDER_CHANNEL : undefined;
  const { hour, minute } = reminder;

  if (reminder.frequency === "once") {
    const when = onceDate(reminder);
    if (!when || when.getTime() <= Date.now() + 5_000) return;
    await scheduleOne(`reminder:${reminder.id}`, reminder, {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId,
    });
    return;
  }

  if (reminder.frequency === "daily") {
    await scheduleOne(`reminder:${reminder.id}`, reminder, {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId,
    });
    return;
  }

  if (reminder.frequency === "weekly") {
    await scheduleOne(`reminder:${reminder.id}`, reminder, {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: reminder.weekday ?? 2,
      hour,
      minute,
      channelId,
    });
    return;
  }

  const weekdays = [2, 3, 4, 5, 6];
  await Promise.all(
    weekdays.map((weekday) =>
      scheduleOne(`reminder:${reminder.id}:${weekday}`, reminder, {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
        channelId,
      }),
    ),
  );
}

export async function removeReminderNotification(id: string): Promise<void> {
  await cancelReminder(id);
}

export async function syncAllReminderNotifications(reminders: ProdReminder[]): Promise<void> {
  for (const reminder of reminders) {
    await syncReminderNotification(reminder, false);
  }
}

export function subscribeReminderNotifications(): () => void {
  const onData = (data: Record<string, unknown> | undefined) => {
    if (!isReminderNotification(data)) return;
    Notifications.clearLastNotificationResponse();
    openRemindersFromNotification();
  };

  const sub = Notifications.addNotificationResponseReceivedListener((event) => {
    onData(event.notification.request.content.data as Record<string, unknown> | undefined);
  });

  void Notifications.getLastNotificationResponseAsync().then((last) => {
    if (!last) return;
    onData(last.notification.request.content.data as Record<string, unknown> | undefined);
  });

  return () => sub.remove();
}
