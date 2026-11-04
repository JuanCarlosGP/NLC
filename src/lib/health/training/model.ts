import { isDateKey, localDateKey, shiftDateKey } from "../weight/model";

export type TrainingSet = { id: string; weightKg: number | null; reps: number | null; warmup: boolean; completed: boolean };
export type TrainingExercise = { id: string; name: string; restSec: number; sets: TrainingSet[] };
export type TrainingSession = {
  id: string; date: string; name: string; note: string; startedAt: number; finishedAt: number | null;
  updatedAt: number; exercises: TrainingExercise[];
};
export type RestTimer = { sessionId: string; exerciseName: string; endsAt: number };
export type TrainingErrorCode = "date" | "name" | "sets" | "exercise" | "empty" | "invalid";
export class TrainingValidationError extends Error {
  constructor(public code: TrainingErrorCode) { super(code); }
}
export function trainingId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
export function newSet(): TrainingSet { return { id: trainingId(), weightKg: null, reps: null, warmup: false, completed: false }; }
export function newExercise(name: string): TrainingExercise {
  return { id: trainingId(), name: name.trim(), restSec: 90, sets: [newSet(), newSet(), newSet()] };
}
export function newSession(name: string, date = localDateKey()): TrainingSession {
  const now = Date.now();
  return validateSession({ id: trainingId(), name: name.trim(), date, note: "", startedAt: now, updatedAt: now, finishedAt: null, exercises: [] });
}
export function validateSession(session: TrainingSession): TrainingSession {
  if (!session || typeof session.id !== "string" || !session.id || !Array.isArray(session.exercises)) throw new TrainingValidationError("invalid");
  if (!isDateKey(session.date)) throw new TrainingValidationError("date");
  if (typeof session.name !== "string" || session.name.length > 120 || typeof session.note !== "string" || session.note.length > 2000) throw new TrainingValidationError("name");
  if (![session.startedAt, session.updatedAt].every(Number.isFinite) || (session.finishedAt !== null && !Number.isFinite(session.finishedAt))) throw new TrainingValidationError("invalid");
  const ids = new Set<string>();
  for (const exercise of session.exercises) {
    if (!exercise || typeof exercise.id !== "string" || ids.has(exercise.id) || !exercise.id || typeof exercise.name !== "string" || !exercise.name.trim() || exercise.name.length > 120 || !Number.isInteger(exercise.restSec) || exercise.restSec < 0 || exercise.restSec > 900) throw new TrainingValidationError("exercise");
    ids.add(exercise.id);
    if (!Array.isArray(exercise.sets) || exercise.sets.length > 100) throw new TrainingValidationError("sets");
    for (const set of exercise.sets) {
      if (!set || typeof set.id !== "string" || ids.has(set.id) || !set.id || typeof set.warmup !== "boolean" || typeof set.completed !== "boolean") throw new TrainingValidationError("sets");
      ids.add(set.id);
      if (set.weightKg !== null && (!Number.isFinite(set.weightKg) || set.weightKg < 0 || set.weightKg > 1500)) throw new TrainingValidationError("sets");
      if (set.reps !== null && (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 1000)) throw new TrainingValidationError("sets");
      if (set.completed && set.reps === null) throw new TrainingValidationError("sets");
    }
  }
  if (session.finishedAt !== null && !session.exercises.some((exercise) => exercise.sets.some((set) => set.completed))) throw new TrainingValidationError("empty");
  return session;
}
export function repeatSession(source: TrainingSession, date = localDateKey()): TrainingSession {
  return { ...newSession(source.name, date), exercises: source.exercises.map((exercise) => ({ ...exercise, id: trainingId(), sets: exercise.sets.map((set) => ({ ...set, id: trainingId(), completed: false })) })) };
}
export function sessionSummary(session: TrainingSession) {
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const done = sets.filter((set) => set.completed);
  const work = done.filter((set) => !set.warmup);
  return { exercises: session.exercises.length, planned: sets.length, completed: done.length, working: work.length,
    volume: Math.round(work.reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0) * 100) / 100 };
}
export function previousExercise(sessions: TrainingSession[], session: TrainingSession, name: string): TrainingExercise | null {
  const key = name.trim().toLocaleLowerCase();
  const previous = sessions.filter((row) => row.id !== session.id && row.finishedAt !== null && (row.date < session.date || (row.date === session.date && row.startedAt < session.startedAt)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
  for (const row of previous) {
    const found = row.exercises.find((exercise) => exercise.name.trim().toLocaleLowerCase() === key);
    if (found) return { ...found, sets: found.sets.filter((set) => set.completed) };
  }
  return null;
}
export function remainingRest(timer: RestTimer, now = Date.now()): number { return Math.max(0, Math.ceil((timer.endsAt - now) / 1000)); }
export function clock(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
export function validateRest(timer: RestTimer): RestTimer {
  if (!timer || typeof timer.sessionId !== "string" || typeof timer.exerciseName !== "string" || !Number.isFinite(timer.endsAt)) throw new TrainingValidationError("invalid");
  return timer;
}
export function monthDays(month: string): (string | null)[] {
  if (!isDateKey(`${month}-01`)) throw new TrainingValidationError("date");
  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const days: (string | null)[] = Array(offset).fill(null);
  for (let day = first; day.startsWith(month); day = shiftDateKey(day, 1)) days.push(day);
  while (days.length % 7) days.push(null);
  return days;
}
export function shiftMonth(month: string, delta: number): string {
  const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
