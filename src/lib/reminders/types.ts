import { dateLocale, t } from "@/lib/i18n/runtime";

export type ReminderFrequency = "once" | "daily" | "weekdays" | "weekly";

export type ProdReminder = {
  id: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  frequency: ReminderFrequency;
  weekday: number | null;
  onceAt: number | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export const FREQUENCIES: ReminderFrequency[] = ["once", "daily", "weekdays", "weekly"];

export const FREQUENCY_LABEL: Record<ReminderFrequency, string> = {
  get once() {
    return t("reminders.once");
  },
  get daily() {
    return t("reminders.daily");
  },
  get weekdays() {
    return t("reminders.weekdays");
  },
  get weekly() {
    return t("reminders.weekly");
  },
};

/** Expo weekly weekday: 1 = Sunday … 7 = Saturday. */
export const WEEKDAY_IDS = [2, 3, 4, 5, 6, 7, 1] as const;

export function weekdayLetter(id: number): string {
  return t(`reminders.letter.${id}`);
}

export const WEEKDAYS: { id: number; label: string }[] = WEEKDAY_IDS.map((id) => ({
  id,
  get label() {
    return weekdayLetter(id);
  },
}));

export function weekdayName(id: number): string {
  return t(`reminders.weekday.${id}`);
}

export const WEEKDAY_NAME: Record<number, string> = {
  get 1() {
    return weekdayName(1);
  },
  get 2() {
    return weekdayName(2);
  },
  get 3() {
    return weekdayName(3);
  },
  get 4() {
    return weekdayName(4);
  },
  get 5() {
    return weekdayName(5);
  },
  get 6() {
    return weekdayName(6);
  },
  get 7() {
    return weekdayName(7);
  },
};

export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatReminderWhen(reminder: ProdReminder): string {
  const time = formatReminderTime(reminder.hour, reminder.minute);
  if (reminder.frequency === "daily") return t("reminders.dailyAt", { time });
  if (reminder.frequency === "weekdays") return t("reminders.weekdaysAt", { time });
  if (reminder.frequency === "weekly") {
    const day = weekdayName(reminder.weekday ?? 2);
    return t("reminders.weeklyAt", { day, time });
  }
  if (reminder.onceAt != null) {
    const day = new Date(reminder.onceAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const diff = start.getTime() - today.getTime();
    const label =
      diff === 0
        ? t("dates.today")
        : diff === 86_400_000
          ? t("dates.tomorrow")
          : day.toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });
    return t("reminders.onceAt", { day: label, time });
  }
  return t("reminders.onceBare", { time });
}
