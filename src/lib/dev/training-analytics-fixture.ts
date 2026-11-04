import { newExercise, newSession, type TrainingSession } from "@/lib/health/training/model";
import { shiftDateKey } from "@/lib/health/weight/model";
export function makeTrainingAnalyticsDemo(today: string): TrainingSession[] {
  return Array.from({ length: 12 }, (_, index) => {
    const date = shiftDateKey(today, -78 + index * 7); const session = newSession("Fuerza · evolución de prueba", date);
    session.id = `demo-training-analytics-${index}`; session.note = "Datos ficticios para comprobar progresión y marcas sin conexión.";
    session.startedAt = new Date(`${date}T09:00:00`).getTime(); session.updatedAt = session.startedAt; session.finishedAt = session.startedAt + 40 * 60000;
    session.exercises = ["Sentadilla", index % 2 === 0 ? "Press de banca" : "Flexiones"].map((name, position) => {
      const exercise = newExercise(name); exercise.id = `${session.id}-exercise-${position}`;
      const kg = position === 0 ? 50 + index * 2.5 : name === "Flexiones" ? null : 35 + index * 1.25;
      exercise.sets = Array.from({ length: 4 }, (_, n) => ({ id: `${exercise.id}-set-${n}`, weightKg: n === 0 && kg !== null ? kg / 2 : kg,
        reps: name === "Flexiones" ? 12 + index : n === 0 ? 10 : 6 + index % 3, warmup: n === 0, completed: true }));
      return exercise;
    });
    return session;
  });
}
