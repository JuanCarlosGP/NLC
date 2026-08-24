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
  once: "Una vez",
  daily: "Cada día",
  weekdays: "Lunes a viernes",
  weekly: "Cada semana",
};

/** Expo weekly weekday: 1 = Sunday … 7 = Saturday. */
export const WEEKDAYS: { id: number; label: string }[] = [
  { id: 2, label: "L" },
  { id: 3, label: "M" },
  { id: 4, label: "X" },
  { id: 5, label: "J" },
  { id: 6, label: "V" },
  { id: 7, label: "S" },
  { id: 1, label: "D" },
];

export const WEEKDAY_NAME: Record<number, string> = {
  1: "domingos",
  2: "lunes",
  3: "martes",
  4: "miércoles",
  5: "jueves",
  6: "viernes",
  7: "sábados",
};

export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatReminderWhen(reminder: ProdReminder): string {
  const time = formatReminderTime(reminder.hour, reminder.minute);
  if (reminder.frequency === "daily") return `Cada día · ${time}`;
  if (reminder.frequency === "weekdays") return `Lunes a viernes · ${time}`;
  if (reminder.frequency === "weekly") {
    const day = WEEKDAY_NAME[reminder.weekday ?? 2] ?? "semana";
    return `Los ${day} · ${time}`;
  }
  if (reminder.onceAt != null) {
    const day = new Date(reminder.onceAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const diff = start.getTime() - today.getTime();
    const label =
      diff === 0 ? "Hoy" : diff === 86_400_000 ? "Mañana" : day.toLocaleDateString("es", { day: "numeric", month: "short" });
    return `${label} · ${time}`;
  }
  return `Una vez · ${time}`;
}
