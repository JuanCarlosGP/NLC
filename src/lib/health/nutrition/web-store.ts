import { createNutritionStore } from "./store";
export const WEB_NUTRITION_KEY = "nlc.health.nutrition.v1";
export function createWebNutritionStore(storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }, now?: () => number) {
  return createNutritionStore({
    async read() { const raw = await storage.getItem(WEB_NUTRITION_KEY); return raw === null ? [] : JSON.parse(raw); },
    async commit(_upserts, _removed, next) { await storage.setItem(WEB_NUTRITION_KEY, JSON.stringify(next)); },
  }, now);
}
