import { isDateKey, localDateKey, shiftDateKey } from "../weight/model";

export type Macros = { calories: number; protein: number; carbs: number; fat: number };
export type NutritionFood = Macros & { name: string; time: string };
export type NutritionDay = Macros & {
  date: string; note: string; source: "manual" | "macrofactor"; foods: NutritionFood[];
  createdAt: number; updatedAt: number;
};
export type NutritionInput = { date: string; note?: string } & Record<keyof Macros, string | number>;
export const MACROS = ["calories", "protein", "carbs", "fat"] as const;
export type NutritionErrorCode = "date" | "future" | keyof Macros | "note" | "conflict" | "missing" | "csv" | "headers" | "size" | "empty" | "duplicate" | "food" | "nativeUpdate";
export class NutritionError extends Error {
  constructor(public readonly code: NutritionErrorCode, public readonly line = 0) { super(code); this.name = "NutritionError"; }
}
export function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
export function nutritionNumber(value: string | number, key: keyof Macros): number {
  if (typeof value !== "string" && typeof value !== "number") throw new NutritionError(key);
  const raw = typeof value === "string" ? value.trim().replace(",", ".") : value;
  if (typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(raw)) throw new NutritionError(key);
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0 || num > (key === "calories" ? 100000 : 20000)) throw new NutritionError(key);
  return round(num);
}
export function normalizeNutrition(input: NutritionInput, today = localDateKey()): Macros & { date: string; note: string } {
  if (!isDateKey(input.date)) throw new NutritionError("date");
  if (input.date > today) throw new NutritionError("future");
  const note = (input.note ?? "").trim(); if (note.length > 2000) throw new NutritionError("note");
  return { date: input.date, note, calories: nutritionNumber(input.calories, "calories"), protein: nutritionNumber(input.protein, "protein"), carbs: nutritionNumber(input.carbs, "carbs"), fat: nutritionNumber(input.fat, "fat") };
}
export function validateDays(days: NutritionDay[]): NutritionDay[] {
  if (!Array.isArray(days)) throw new Error("Invalid nutrition storage");
  const dates = new Set<string>();
  for (const day of days) {
    const clean = normalizeNutrition(day, "9999-12-31");
    if (dates.has(day.date) || !["manual", "macrofactor"].includes(day.source) || !Array.isArray(day.foods) || !Number.isFinite(day.createdAt) || !Number.isFinite(day.updatedAt) || day.note !== clean.note || MACROS.some((key) => day[key] !== clean[key])) throw new Error("Invalid nutrition storage");
    for (const food of day.foods) {
      if (typeof food.name !== "string" || !food.name.trim() || food.name.length > 1000 || (food.time !== "" && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(food.time)) || MACROS.some((key) => food[key] !== nutritionNumber(food[key], key))) throw new Error("Invalid nutrition food");
    }
    dates.add(day.date);
  }
  return [...days].sort((a, b) => b.date.localeCompare(a.date));
}
export type ImportedDay = Macros & { date: string; foods: NutritionFood[] };
export function sameImport(day: NutritionDay, incoming: ImportedDay): boolean {
  return day.source === "macrofactor" && MACROS.every((key) => day[key] === incoming[key]) && JSON.stringify(day.foods) === JSON.stringify(incoming.foods);
}
export function importPreview(days: NutritionDay[], incoming: ImportedDay[], replace: boolean) {
  let added = 0, replaced = 0, kept = 0, unchanged = 0, manual = 0;
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const row of incoming) {
    const previous = byDate.get(row.date);
    if (!previous) added++;
    else if (sameImport(previous, row)) unchanged++;
    else if (replace) { replaced++; if (previous.source === "manual") manual++; }
    else kept++;
  }
  return { added, replaced, kept, unchanged, manual };
}
export function nutritionWeek(days: NutritionDay[], date: string) {
  const range = days.filter((day) => day.date >= shiftDateKey(date, -6) && day.date <= date);
  return { count: range.length, average: range.length ? round(range.reduce((sum, day) => sum + day.calories, 0) / range.length) : null };
}
