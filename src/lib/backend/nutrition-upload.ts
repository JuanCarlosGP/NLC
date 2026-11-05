import type { ImportedDay } from "@/lib/health/nutrition/model";
const uploads = new WeakMap<ImportedDay[], string>();
export function rememberNutritionUpload(days: ImportedDay[], id: string) { uploads.set(days, id); }
export const nutritionUpload = (days: ImportedDay[]) => uploads.get(days);
