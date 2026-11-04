import type { CatalogDb } from "@/lib/db/types";
import { isDateKey, normalizeWeightInput, WeightValidationError, type WeightEntry, type WeightInput } from "./model";

export type WeightStore = {
  list(): Promise<WeightEntry[]>;
  save(input: WeightInput, originalDate?: string): Promise<WeightEntry>;
  remove(entryDate: string): Promise<void>;
};

export function createWeightStore(openDb: () => Promise<CatalogDb>): WeightStore {
  // Serialize edits, including date changes, without nesting the app's SQLite transactions.
  let pending: Promise<unknown> = Promise.resolve();
  function write<T>(task: () => Promise<T>): Promise<T> {
    const next = pending.then(task);
    pending = next.catch(() => {});
    return next;
  }

  return {
    async list() {
      await pending;
      const db = await openDb();
      return db.getAllAsync<WeightEntry>(
        `SELECT entry_date AS entryDate, weight_kg AS weightKg, note,
                created_at AS createdAt, updated_at AS updatedAt
         FROM health_weight_entries ORDER BY entry_date DESC`,
      );
    },
    save(input, originalDate) {
      return write(async () => {
        const normalized = normalizeWeightInput(input);
        if (originalDate && !isDateKey(originalDate)) throw new WeightValidationError("date");
        const db = await openDb();
        const existing = await db.getFirstAsync<{ createdAt: number }>(
          "SELECT created_at AS createdAt FROM health_weight_entries WHERE entry_date = ?",
          originalDate ?? normalized.entryDate,
        );
        if (originalDate && !existing) throw new WeightValidationError("missing");
        const now = Date.now();
        const entry = { ...normalized, createdAt: existing?.createdAt ?? now, updatedAt: now };
        if (originalDate && originalDate !== entry.entryDate) {
          const target = await db.getFirstAsync<{ entry_date: string }>(
            "SELECT entry_date FROM health_weight_entries WHERE entry_date = ?", entry.entryDate,
          );
          if (target) throw new WeightValidationError("conflict");
          // A primary-key update moves the entry atomically; no delete/insert data-loss window.
          await db.runAsync(
            "UPDATE health_weight_entries SET entry_date = ?, weight_kg = ?, note = ?, updated_at = ? WHERE entry_date = ?",
            entry.entryDate, entry.weightKg, entry.note, now, originalDate,
          );
        } else {
          await db.runAsync(
            `INSERT INTO health_weight_entries (entry_date, weight_kg, note, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(entry_date) DO UPDATE SET weight_kg = excluded.weight_kg,
               note = excluded.note, updated_at = excluded.updated_at`,
            entry.entryDate, entry.weightKg, entry.note, entry.createdAt, now,
          );
        }
        return entry;
      });
    },
    remove(entryDate) {
      return write(async () => {
        if (!isDateKey(entryDate)) throw new WeightValidationError("date");
        const db = await openDb();
        await db.runAsync("DELETE FROM health_weight_entries WHERE entry_date = ?", entryDate);
      });
    },
  };
}
