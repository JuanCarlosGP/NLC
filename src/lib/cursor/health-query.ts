import { tr } from "@/lib/i18n/runtime";
import { weightStore } from "@/lib/health/weight/storage";
import { nutritionStore } from "@/lib/health/nutrition/storage";
import { trainingStore } from "@/lib/health/training/storage";
import { medicationStore } from "@/lib/health/medication/storage";
import { bodyStore } from "@/lib/health/body-photos/storage";
import { localDateKey } from "@/lib/health/weight/model";

export async function answerHealthSummary(area: unknown): Promise<string> {
  const today = localDateKey();
  const month = today.slice(0, 7);
  const inMonth = (day: string) => day.startsWith(month) && day <= today;
  const nothing = tr("No entries for this month.", "No hay registros este mes.");
  switch (area) {
    case "weight": {
      const rows = (await weightStore.list()).filter(row => inMonth(row.entryDate));
      const last = rows[0];
      if (!last) return nothing;
      const first = rows.at(-1)!;
      return tr(
        `Weight this month: ${first.weightKg} kg (${first.entryDate}) → ${last.weightKg} kg (${last.entryDate}). ${rows.length} entries.`,
        `Peso este mes: ${first.weightKg} kg (${first.entryDate}) → ${last.weightKg} kg (${last.entryDate}). ${rows.length} registros.`,
      );
    }
    case "nutrition": {
      const rows = (await nutritionStore.list()).filter(row => inMonth(row.date));
      if (!rows.length) return nothing;
      const average = (key: "calories" | "protein" | "carbs" | "fat") =>
        Math.round(rows.reduce((total, row) => total + row[key], 0) / rows.length);
      return tr(
        `Average across ${rows.length} recorded days: ${average("calories")} kcal, ${average("protein")} g protein, ${average("carbs")} g carbs and ${average("fat")} g fat.`,
        `Media de ${rows.length} días registrados: ${average("calories")} kcal, ${average("protein")} g de proteína, ${average("carbs")} g de carbohidratos y ${average("fat")} g de grasa.`,
      );
    }
    case "training": {
      const sessions = (await trainingStore.list()).filter(session => inMonth(session.date) && session.finishedAt !== null);
      return tr(`Completed workouts this month: ${sessions.length}.`, `Entrenamientos completados este mes: ${sessions.length}.`);
    }
    case "medication": {
      const { logs } = await medicationStore.read();
      const taken = logs.filter(log => inMonth(log.date) && log.status === "taken").length;
      const skipped = logs.filter(log => inMonth(log.date) && log.status === "skipped").length;
      return tr(`Recorded this month: ${taken} doses taken and ${skipped} skipped.`, `Este mes constan ${taken} tomas realizadas y ${skipped} omitidas.`);
    }
    case "bodyPhotos": {
      const reviews = (await bodyStore.list()).filter(review => inMonth(review.date));
      const photos = reviews.reduce((count, review) => count + Object.keys(review.photos).length, 0);
      return tr(`This month: ${photos} photos on ${reviews.length} dates.`, `Este mes: ${photos} fotos en ${reviews.length} fechas.`);
    }
    default:
      return tr("Which part of Health do you want to check?", "¿Qué apartado de Salud quieres consultar?");
  }
}
