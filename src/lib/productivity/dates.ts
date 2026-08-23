import type { TaskStatus } from "@/lib/productivity/types";

const DAY_MS = 86_400_000;

export function startOfDay(ts = Date.now()): number {
  const next = new Date(ts);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

export function endOfDay(ts = Date.now()): number {
  return startOfDay(ts) + DAY_MS;
}

export function dueToday(): number {
  return startOfDay();
}

export function dueTomorrow(): number {
  return startOfDay() + DAY_MS;
}

export function isDueToday(dueAt: number | null): boolean {
  if (dueAt == null) return false;
  const start = startOfDay();
  return dueAt >= start && dueAt < start + DAY_MS;
}

export function isOverdue(dueAt: number | null, status: TaskStatus): boolean {
  if (dueAt == null || status === "done") return false;
  return dueAt < startOfDay();
}

export function formatDue(dueAt: number): string {
  const start = startOfDay(dueAt);
  const today = startOfDay();
  if (start === today) return "Hoy";
  if (start === today + DAY_MS) return "Mañana";
  if (start === today - DAY_MS) return "Ayer";
  return new Date(dueAt).toLocaleDateString("es", { day: "numeric", month: "short" });
}
