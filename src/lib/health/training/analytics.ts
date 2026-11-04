import { isDateKey, localDateKey, shiftDateKey } from "../weight/model";
import { validateSession, type TrainingSession, type TrainingSet } from "./model";

export type TrainingPeriod = "30" | "90" | "365" | "all";
export type ProgressMetric = "load" | "volume" | "reps" | "estimated";
export type MarkKind = "load" | "setVolume" | "volume" | "reps" | "estimated";
export type SetReference = { sessionId: string; sessionName: string; date: string; exerciseId: string; setId: string; weightKg: number | null; reps: number };
export type TrainingMark = { value: number; reference: SetReference };
export type ExercisePoint = {
  sessionId: string; sessionName: string; date: string; startedAt: number;
  sets: number; repetitions: number; loadedSets: number; missingLoadSets: number;
  volume: number | null; load: number | null; reps: number; estimated: number | null;
  marks: MarkKind[]; references: Partial<Record<MarkKind, TrainingMark>>;
};
export type ExerciseAnalytics = { key: string; name: string; points: ExercisePoint[]; records: Partial<Record<MarkKind, TrainingMark>>; sets: number };
export const roundTraining = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
// Keep accents and equipment names; only normalize spelling-neutral differences.
export function exerciseKey(name: string): string { return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase(); }
export function estimatedMax(weight: number | null, reps: number): number | null {
  if (weight === null || !Number.isFinite(weight) || weight <= 0 || !Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}
function promote(records: Partial<Record<MarkKind, TrainingMark>>, kind: MarkKind, value: number | null, reference: SetReference) {
  if (value === null) return; value = roundTraining(value);
  if (value <= 0) return;
  if (!records[kind] || value > records[kind]!.value) records[kind] = { value, reference };
}
export function trainingAnalytics(sessions: TrainingSession[], today = localDateKey()): ExerciseAnalytics[] {
  if (!isDateKey(today)) throw new Error("Invalid analytics date");
  const result = new Map<string, ExerciseAnalytics>();
  const ids = new Set<string>();
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  for (const session of sorted) {
    validateSession(session);
    if (ids.has(session.id)) throw new Error("Duplicate training session"); ids.add(session.id);
    if (session.finishedAt === null || session.date > today) continue;
    // Repeated exercise blocks in one session form a single progression point.
    const blocks = new Map<string, { name: string; sets: { exerciseId: string; set: TrainingSet }[] }>();
    for (const exercise of session.exercises) {
      const key = exerciseKey(exercise.name); const block = blocks.get(key) ?? { name: exercise.name.trim().replace(/\s+/g, " "), sets: [] };
      for (const set of exercise.sets) if (set.completed && !set.warmup) block.sets.push({ exerciseId: exercise.id, set });
      blocks.set(key, block);
    }
    for (const [key, block] of blocks) {
      if (!block.sets.length) continue;
      const group = result.get(key) ?? { key, name: block.name, points: [], records: {}, sets: 0 };
      const references: Partial<Record<MarkKind, TrainingMark>> = {};
      let volume = 0, knownLoad = 0, loaded = 0, missingLoad = 0, repetitions = 0;
      for (const { set, exerciseId } of block.sets) {
        const ref: SetReference = { sessionId: session.id, sessionName: session.name, date: session.date, exerciseId, setId: set.id, weightKg: set.weightKg, reps: set.reps! };
        repetitions += set.reps!;
        if (set.weightKg !== null) { knownLoad++; volume += set.weightKg * set.reps!; } else missingLoad++;
        if ((set.weightKg ?? 0) > 0) loaded++;
        promote(references, "load", set.weightKg, ref);
        promote(references, "reps", set.reps!, ref);
        promote(references, "setVolume", set.weightKg === null ? null : set.weightKg * set.reps!, ref);
        promote(references, "estimated", estimatedMax(set.weightKg, set.reps!), ref);
      }
      const anchor = references.setVolume?.reference ?? references.reps!.reference;
      promote(references, "volume", volume, anchor);
      const marks: MarkKind[] = [];
      for (const kind of ["load", "setVolume", "volume", "reps", "estimated"] as const) {
        const mark = references[kind];
        if (mark && (!group.records[kind] || mark.value > group.records[kind]!.value)) {
          if (group.points.length) marks.push(kind);
          group.records[kind] = mark;
        }
      }
      group.points.push({ sessionId: session.id, sessionName: session.name, date: session.date, startedAt: session.startedAt, sets: block.sets.length, repetitions, loadedSets: loaded, missingLoadSets: missingLoad,
        volume: knownLoad ? roundTraining(volume) : null, load: references.load?.value ?? null, reps: references.reps!.value, estimated: references.estimated?.value ?? null, marks, references });
      group.sets += block.sets.length; result.set(key, group);
    }
  }
  return [...result.values()].sort((a, b) => b.sets - a.sets || a.key.localeCompare(b.key));
}
export function periodPoints(points: ExercisePoint[], period: TrainingPeriod, today = localDateKey()): ExercisePoint[] {
  if (!isDateKey(today) || !["30", "90", "365", "all"].includes(period)) throw new Error("Invalid analytics period");
  const from = period === "all" ? "0000-01-01" : shiftDateKey(today, 1 - Number(period));
  return points.filter((point) => point.date >= from && point.date <= today);
}
export function progressSummary(points: ExercisePoint[]) {
  const knownVolumes = points.flatMap((point) => point.volume === null ? [] : [point.volume]);
  return { sessions: points.length, days: new Set(points.map((point) => point.date)).size,
    sets: points.reduce((sum, point) => sum + point.sets, 0), repetitions: points.reduce((sum, point) => sum + point.repetitions, 0),
    volume: knownVolumes.length ? roundTraining(knownVolumes.reduce((sum, value) => sum + value, 0)) : null,
    loadedSets: points.reduce((sum, point) => sum + point.loadedSets, 0), missingLoadSets: points.reduce((sum, point) => sum + point.missingLoadSets, 0) };
}
export function metricChange(points: ExercisePoint[], metric: ProgressMetric) {
  const valid = points.filter((point) => point[metric] !== null);
  if (valid.length < 2) return null;
  const first = valid[0][metric]!; const last = valid[valid.length - 1][metric]!;
  return { first, last, difference: roundTraining(last - first), percent: first === 0 ? null : roundTraining((last - first) / first * 100) };
}
export function weekStart(date: string) { return shiftDateKey(date, -(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7); }
export function weeklyVolume(points: ExercisePoint[], period: TrainingPeriod, today = localDateKey()) {
  const filtered = periodPoints(points, period, today);
  const groups = new Map<string, { week: string; sessions: number; sets: number; volume: number | null }>();
  const first = period === "all" ? filtered[0]?.date : shiftDateKey(today, 1 - Number(period));
  if (!first) return [];
  // Weeks without a completed session are gaps, not recorded zero-volume sessions.
  for (const point of filtered) {
    const week = weekStart(point.date); const row = groups.get(week) ?? { week, sessions: 0, sets: 0, volume: null };
    row.sessions++; row.sets += point.sets; if (point.volume !== null) row.volume = roundTraining((row.volume ?? 0) + point.volume); groups.set(week, row);
  }
  return [...groups.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export function progressGeometry(points: ExercisePoint[], metric: ProgressMetric, width: number) {
  const valid = points.flatMap((point) => point[metric] === null ? [] : [point[metric]!]);
  if (!valid.length) return null;
  const maximum = valid.reduce((max, value) => Math.max(max, value), 0);
  const high = maximum === 0 ? 1 : Math.ceil(maximum / 10 ** Math.floor(Math.log10(maximum))) * 10 ** Math.floor(Math.log10(maximum));
  const usable = Math.max(100, Number.isFinite(width) ? width : 100); let segment = ""; const paths: string[] = [];
  const dots: { index: number; x: number; y: number }[] = [];
  points.forEach((point, index) => {
    const value = point[metric];
    if (value === null) { if (segment) paths.push(segment); segment = ""; return; }
    const x = points.length === 1 ? usable / 2 : 8 + index * (usable - 16) / (points.length - 1); const y = 12 + 140 * (1 - value / high);
    segment += `${segment ? " L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`; dots.push({ index, x, y });
  });
  if (segment) paths.push(segment);
  return { high, paths, dots };
}
