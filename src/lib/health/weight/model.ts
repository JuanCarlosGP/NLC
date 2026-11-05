import { hasPhoneClock, phoneDateKey, phoneNow } from "../../backend/clock";
export type WeightEntry = {
  entryDate: string;
  weightKg: number;
  note: string;
  createdAt: number;
  updatedAt: number;
};

export type WeightInput = { entryDate: string; weightKg: string | number; note?: string };
export type WeightErrorCode = "date" | "weight" | "note" | "conflict" | "missing";

export class WeightValidationError extends Error {
  constructor(public readonly code: WeightErrorCode) {
    super(code);
    this.name = "WeightValidationError";
  }
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localDateKey(date = new Date(phoneNow())): string {
  if (hasPhoneClock()) return phoneDateKey(date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Calendar arithmetic uses UTC so a seven-day range stays seven dates across DST.
export function shiftDateKey(value: string, days: number): string {
  if (!isDateKey(value)) throw new WeightValidationError("date");
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeWeightInput(input: WeightInput) {
  if (!isDateKey(input.entryDate)) throw new WeightValidationError("date");
  const raw = typeof input.weightKg === "string" ? input.weightKg.trim().replace(",", ".") : input.weightKg;
  if (typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(raw)) throw new WeightValidationError("weight");
  const weight = Number(raw);
  if (!Number.isFinite(weight) || weight < 20 || weight > 400) throw new WeightValidationError("weight");
  const note = (input.note ?? "").trim();
  if (note.length > 1000) throw new WeightValidationError("note");
  return { entryDate: input.entryDate, weightKg: Math.round(weight * 10) / 10, note };
}

export function sortWeightEntries(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
}

export function weightSummary(entries: WeightEntry[]) {
  const sorted = sortWeightEntries(entries);
  const latest = sorted[0] ?? null;
  const first = sorted[sorted.length - 1] ?? null;
  const week = latest ? sorted.filter((entry) => entry.entryDate >= shiftDateKey(latest.entryDate, -6)) : [];
  return {
    latest,
    count: sorted.length,
    average7d: week.length ? week.reduce((sum, entry) => sum + entry.weightKg, 0) / week.length : null,
    changeKg: latest && first && latest !== first ? Math.round((latest.weightKg - first.weightKg) * 10) / 10 : null,
  };
}

export function weightChartPoints(entries: WeightEntry[], fromDate?: string) {
  const sorted = sortWeightEntries(entries).reverse();
  let start = 0;
  let total = 0;
  const points = sorted.map((entry, index) => {
    total += entry.weightKg;
    const from = shiftDateKey(entry.entryDate, -6);
    while (sorted[start]!.entryDate < from) total -= sorted[start++]!.weightKg;
    return { date: entry.entryDate, weightKg: entry.weightKg, average7d: total / (index - start + 1) };
  });
  return fromDate ? points.filter((point) => point.date >= fromDate) : points;
}

export function weightMonths(entries: WeightEntry[]) {
  const months = new Map<string, { month: string; count: number; total: number; min: number; max: number }>();
  for (const entry of entries) {
    const month = entry.entryDate.slice(0, 7);
    const group = months.get(month) ?? { month, count: 0, total: 0, min: entry.weightKg, max: entry.weightKg };
    group.count += 1;
    group.total += entry.weightKg;
    group.min = Math.min(group.min, entry.weightKg);
    group.max = Math.max(group.max, entry.weightKg);
    months.set(month, group);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month)).map((group) => ({
    month: group.month, count: group.count, average: group.total / group.count, min: group.min, max: group.max,
  }));
}
