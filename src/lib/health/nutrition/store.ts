import type { CatalogDb } from "../../db/types";
import { localDateKey } from "../weight/model";
import { importPreview, normalizeNutrition, NutritionError, sameImport, validateDays, type ImportedDay, type NutritionDay, type NutritionInput } from "./model";
export type NutritionPersistence = {
  read(): Promise<NutritionDay[]>;
  commit(upserts: NutritionDay[], removed: string[], next: NutritionDay[]): Promise<void>;
};
export function createNutritionStore(persistence: NutritionPersistence, now = () => Date.now()) {
  let pending: Promise<unknown> = Promise.resolve();
  function write<T>(task: () => Promise<T>) { const next = pending.then(task); pending = next.catch(() => {}); return next; }
  async function read() { return validateDays(await persistence.read()); }
  return {
    async list() { await pending; return read(); },
    save(input: NutritionInput, originalDate?: string) {
      return write(async () => {
        const timestamp = now(); const clean = normalizeNutrition(input, localDateKey(new Date(timestamp))); const rows = await read();
        const previous = originalDate ? rows.find((day) => day.date === originalDate) : undefined;
        if (originalDate && !previous) throw new NutritionError("missing");
        if (rows.some((day) => day.date === clean.date && day.date !== originalDate)) throw new NutritionError("conflict");
        const day: NutritionDay = { ...clean, source: "manual", foods: [], createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp };
        const next = validateDays([...rows.filter((row) => row.date !== originalDate), day]);
        await persistence.commit([day], originalDate && originalDate !== day.date ? [originalDate] : [], next); return next;
      });
    },
    remove(date: string) {
      return write(async () => { const rows = await read(); const next = rows.filter((day) => day.date !== date); await persistence.commit([], [date], next); return next; });
    },
    importDays(incoming: ImportedDay[], replace = false) {
      return write(async () => {
        if (!incoming.length || incoming.length > 20000 || new Set(incoming.map((day) => day.date)).size !== incoming.length) throw new NutritionError("duplicate");
        const timestamp = now(); const today = localDateKey(new Date(timestamp)); const rows = await read();
        const upserts: NutritionDay[] = []; const byDate = new Map(rows.map((day) => [day.date, day]));
        for (const candidate of incoming) {
          const clean = normalizeNutrition(candidate, today); const previous = byDate.get(candidate.date);
          const day: NutritionDay = { ...clean, note: previous?.note ?? "", source: "macrofactor", foods: candidate.foods, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp };
          validateDays([day]);
          if (!previous || (replace && !sameImport(previous, candidate))) upserts.push(day);
        }
        const dates = new Set(upserts.map((day) => day.date));
        const next = validateDays([...rows.filter((day) => !dates.has(day.date)), ...upserts]);
        if (upserts.length) await persistence.commit(upserts, [], next);
        return { days: next, result: importPreview(rows, incoming, replace) };
      });
    },
  };
}
export type NutritionStore = ReturnType<typeof createNutritionStore>;
export function createSqlNutritionStore(open: () => Promise<CatalogDb>, transact: (db: CatalogDb, task: () => Promise<void>) => Promise<void>, now?: () => number): NutritionStore {
  return createNutritionStore({
    async read() { return (await (await open()).getAllAsync<{ payload: string }>("SELECT payload FROM health_nutrition_days ORDER BY entry_date DESC")).map((row) => JSON.parse(row.payload)); },
    async commit(upserts, removed) {
      const db = await open(); await transact(db, async () => {
        for (const date of removed) await db.runAsync("DELETE FROM health_nutrition_days WHERE entry_date = ?", date);
        for (const day of upserts) await db.runAsync("INSERT INTO health_nutrition_days (entry_date, payload) VALUES (?, ?) ON CONFLICT(entry_date) DO UPDATE SET payload = excluded.payload", day.date, JSON.stringify(day));
      });
    },
  }, now);
}
