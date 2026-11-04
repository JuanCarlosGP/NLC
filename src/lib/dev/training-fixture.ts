import { newExercise, newSession, type TrainingSession } from "@/lib/health/training/model";
import { shiftDateKey } from "@/lib/health/weight/model";
export function makeTrainingDemoSessions(today: string): TrainingSession[] {
  return [
    { days: -5, name: "Fuerza A", exercises: [["Sentadilla", 60, 8], ["Press de banca", 40, 10]], finished: true },
    { days: -2, name: "Fuerza B", exercises: [["Peso muerto", 70, 6], ["Remo con mancuerna", 18, 12]], finished: true },
    { days: 0, name: "Fuerza A", exercises: [["Sentadilla", 62.5, 8], ["Press de banca", 42.5, 10]], finished: false },
  ].map((item, index) => {
    const date = shiftDateKey(today, item.days); const session = newSession(item.name, date);
    session.id = `demo-training-${index}`; session.note = "Sesión ficticia para comprobar el registro local.";
    session.startedAt = new Date(`${date}T09:00:00`).getTime(); session.updatedAt = session.startedAt;
    session.finishedAt = item.finished ? session.startedAt + 45 * 60000 : null;
    session.exercises = item.exercises.map(([name, kg, reps], exerciseIndex) => {
      const exercise = newExercise(String(name)); exercise.id = `${session.id}-exercise-${exerciseIndex}`;
      exercise.sets = exercise.sets.map((set, setIndex) => ({ ...set, id: `${exercise.id}-set-${setIndex}`, weightKg: setIndex === 0 ? Number(kg) / 2 : Number(kg), reps: Number(reps), warmup: setIndex === 0, completed: item.finished || exerciseIndex === 0 && setIndex === 0 }));
      return exercise;
    });
    return session;
  });
}
