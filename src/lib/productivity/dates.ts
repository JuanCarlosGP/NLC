import { hasPhoneClock, phoneNow, phoneDayStart, phoneTimeZone } from "../backend/clock";
import { dateLocale, t } from "@/lib/i18n/runtime";
import type { TaskStatus } from "@/lib/productivity/types";

const DAY_MS = 86_400_000;

export function startOfDay(ts = phoneNow()): number {
  if (hasPhoneClock()) return phoneDayStart(ts);
  const next = new Date(ts);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

export function endOfDay(ts = phoneNow()): number {
  return hasPhoneClock() ? phoneDayStart(ts, 1) : startOfDay(ts) + DAY_MS;
}

export function dueToday(): number {
  return startOfDay();
}

export function dueTomorrow(): number {
  return hasPhoneClock() ? phoneDayStart(phoneNow(), 1) : startOfDay() + DAY_MS;
}

export function isDueToday(dueAt: number | null): boolean {
  if (dueAt == null) return false;
  const start = startOfDay();
  return dueAt >= start && dueAt < endOfDay();
}

export function isOverdue(dueAt: number | null, status: TaskStatus): boolean {
  if (dueAt == null || status === "done") return false;
  return dueAt < startOfDay();
}

export function formatDue(dueAt: number): string {
  const start = startOfDay(dueAt);
  const today = startOfDay();
  if (start === today) return t("dates.today");
  if (start === today + DAY_MS) return t("dates.tomorrow");
  if (start === today - DAY_MS) return t("dates.yesterday");
  return new Date(dueAt).toLocaleDateString(dateLocale(), { day: "numeric", month: "short", timeZone: phoneTimeZone() });
}
