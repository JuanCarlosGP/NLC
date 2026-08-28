import { t } from "@/lib/i18n/runtime";
import { getDb } from "@/lib/db/client";
import type { ProdReminder, ReminderFrequency } from "@/lib/reminders/types";

type ReminderRow = {
  id: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  frequency: string;
  weekday: number | null;
  once_at: number | null;
  enabled: number;
  created_at: number;
  updated_at: number;
};

function newId(): string {
  return `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asFrequency(value: string): ReminderFrequency {
  if (value === "daily" || value === "weekdays" || value === "weekly" || value === "once") return value;
  return "daily";
}

function mapReminder(row: ReminderRow): ProdReminder {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    hour: row.hour,
    minute: row.minute,
    frequency: asFrequency(row.frequency),
    weekday: row.weekday,
    onceAt: row.once_at,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ReminderInput = {
  title: string;
  body?: string;
  hour: number;
  minute: number;
  frequency: ReminderFrequency;
  weekday?: number | null;
  onceAt?: number | null;
  enabled?: boolean;
};

export async function listReminders(): Promise<ProdReminder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ReminderRow>(
    `SELECT id, title, body, hour, minute, frequency, weekday, once_at, enabled, created_at, updated_at
     FROM prod_reminders
     ORDER BY enabled DESC, hour ASC, minute ASC, created_at ASC`,
  );
  return rows.map(mapReminder);
}

export async function getReminder(id: string): Promise<ProdReminder | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ReminderRow>(
    `SELECT id, title, body, hour, minute, frequency, weekday, once_at, enabled, created_at, updated_at
     FROM prod_reminders WHERE id = ?`,
    id,
  );
  return row ? mapReminder(row) : null;
}

export async function createReminder(input: ReminderInput): Promise<ProdReminder> {
  const title = input.title.trim();
  if (!title) throw new Error(t("reminders.needMessage"));
  const db = await getDb();
  const now = Date.now();
  const id = newId();
  const body = input.body?.trim() ?? "";
  const weekday = input.frequency === "weekly" ? input.weekday ?? 2 : null;
  const onceAt = input.frequency === "once" ? input.onceAt ?? startOfDay(now) : null;
  const enabled = input.enabled !== false ? 1 : 0;
  await db.runAsync(
    `INSERT INTO prod_reminders
     (id, title, body, hour, minute, frequency, weekday, once_at, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    title,
    body,
    clampHour(input.hour),
    clampMinute(input.minute),
    input.frequency,
    weekday,
    onceAt,
    enabled,
    now,
    now,
  );
  return (await getReminder(id))!;
}

export async function updateReminder(id: string, patch: Partial<ReminderInput>): Promise<void> {
  const current = await getReminder(id);
  if (!current) return;
  const title = patch.title !== undefined ? patch.title.trim() || current.title : current.title;
  const body = patch.body !== undefined ? patch.body.trim() : current.body;
  const hour = patch.hour !== undefined ? clampHour(patch.hour) : current.hour;
  const minute = patch.minute !== undefined ? clampMinute(patch.minute) : current.minute;
  const frequency = patch.frequency ?? current.frequency;
  const weekday = frequency === "weekly" ? (patch.weekday !== undefined ? patch.weekday : current.weekday) ?? 2 : null;
  const onceAt = frequency === "once" ? (patch.onceAt !== undefined ? patch.onceAt : current.onceAt) : null;
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : current.enabled ? 1 : 0;
  const db = await getDb();
  await db.runAsync(
    `UPDATE prod_reminders
     SET title = ?, body = ?, hour = ?, minute = ?, frequency = ?, weekday = ?, once_at = ?, enabled = ?, updated_at = ?
     WHERE id = ?`,
    title,
    body,
    hour,
    minute,
    frequency,
    weekday,
    onceAt,
    enabled,
    Date.now(),
    id,
  );
}

export async function deleteReminder(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM prod_reminders WHERE id = ?", id);
}

export async function replaceReminders(reminders: ProdReminder[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM prod_reminders");
    for (const reminder of reminders) {
      await db.runAsync(
        `INSERT INTO prod_reminders
         (id, title, body, hour, minute, frequency, weekday, once_at, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        reminder.id,
        reminder.title,
        reminder.body,
        clampHour(reminder.hour),
        clampMinute(reminder.minute),
        reminder.frequency,
        reminder.weekday,
        reminder.onceAt,
        reminder.enabled ? 1 : 0,
        reminder.createdAt,
        reminder.updatedAt,
      );
    }
  });
}

function clampHour(value: number): number {
  if (!Number.isFinite(value)) return 9;
  return Math.min(23, Math.max(0, Math.round(value)));
}

function clampMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(59, Math.max(0, Math.round(value)));
}

function startOfDay(ts: number): number {
  const next = new Date(ts);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}
