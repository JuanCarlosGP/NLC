import { isDateKey, normalizeWeightInput, sortWeightEntries, WeightValidationError, type WeightEntry } from "./model";
import type { WeightStore } from "./store";

// The web catalogue is in memory. Weight has its own persistent browser fallback.
export const WEB_WEIGHT_KEY = "nlc.health.weight.v1";
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };

export function createWebWeightStore(storage: Storage): WeightStore {
  let pending: Promise<unknown> = Promise.resolve();
  async function read(): Promise<WeightEntry[]> {
    const raw = await storage.getItem(WEB_WEIGHT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid weight storage");
    // Fail visibly instead of replacing unreadable saved data with an empty list.
    for (const entry of parsed) {
      const clean = normalizeWeightInput(entry);
      if (clean.weightKg !== entry.weightKg || !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.updatedAt)) {
        throw new Error("Invalid weight storage");
      }
    }
    return sortWeightEntries(parsed);
  }
  function write<T>(task: () => Promise<T>): Promise<T> {
    const next = pending.then(task);
    pending = next.catch(() => {});
    return next;
  }
  return {
    async list() { await pending; return read(); },
    save(input, originalDate) {
      return write(async () => {
        const normalized = normalizeWeightInput(input);
        const rows = await read();
        const previous = rows.find((entry) => entry.entryDate === (originalDate ?? normalized.entryDate));
        if (originalDate && !previous) throw new WeightValidationError("missing");
        if (originalDate && originalDate !== normalized.entryDate && rows.some((entry) => entry.entryDate === normalized.entryDate)) {
          throw new WeightValidationError("conflict");
        }
        const now = Date.now();
        const entry = { ...normalized, createdAt: previous?.createdAt ?? now, updatedAt: now };
        const next = rows.filter((row) => row.entryDate !== (originalDate ?? normalized.entryDate));
        next.push(entry);
        await storage.setItem(WEB_WEIGHT_KEY, JSON.stringify(sortWeightEntries(next)));
        return entry;
      });
    },
    remove(entryDate) {
      return write(async () => {
        if (!isDateKey(entryDate)) throw new WeightValidationError("date");
        const rows = await read();
        await storage.setItem(WEB_WEIGHT_KEY, JSON.stringify(rows.filter((entry) => entry.entryDate !== entryDate)));
      });
    },
  };
}
