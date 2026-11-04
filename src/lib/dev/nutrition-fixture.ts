import { nutritionStore } from "@/lib/health/nutrition/storage";
import { parseMacroFactor } from "@/lib/health/nutrition/macrofactor";
import { localDateKey, shiftDateKey } from "@/lib/health/weight/model";
import { requireLocalDemo } from "./local-demo";
export async function seedNutritionDemo() {
  requireLocalDemo(); const today = localDateKey(); const saved = await nutritionStore.list();
  const rows = ["Date,Time,Food Name,Calories (kcal),Protein (g),Carbs (g),Fat (g)"];
  for (let i = 14; i >= 1; i--) {
    const date = shiftDateKey(today, -i);
    if (i > 7) {
      rows.push(`${date},08:00,Desayuno ficticio,450,25,60,12`, `${date},14:00,Comida ficticia,750,45,85,25`, `${date},21:00,Cena ficticia,${700 + i * 15},50,80,22`);
    } else if (!saved.some((day) => day.date === date)) {
      await nutritionStore.save({ date, calories: 2100 + i * 35, protein: 135 + i * 2, carbs: 250 + i * 4, fat: 65 + i, note: "Datos ficticios para comprobar nutrición en local." });
    }
  }
  await nutritionStore.importDays(parseMacroFactor(rows.join("\n")));
}
