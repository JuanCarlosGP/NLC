const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText, file);
const a = require('../src/lib/health/training/analytics.ts');
const { createTrainingStore } = require('../src/lib/health/training/store.ts');
const { createWebTrainingStore } = require('../src/lib/health/training/web-store.ts');
const { SCHEMA_SQL } = require('../src/lib/db/schema.ts');
const today = '2026-11-03';
function session(id, date, weight = 60, reps = 8, overrides = {}) {
  const startedAt = new Date(`${date}T09:00:00Z`).getTime();
  return { id, date, name: 'Fuerza', note: '', startedAt, updatedAt: startedAt, finishedAt: startedAt + 1000,
    exercises: [{ id: `${id}-ex`, name: 'Sentadilla', restSec: 90, sets: [{ id: `${id}-set`, weightKg: weight, reps, warmup: false, completed: true }] }], ...overrides };
}
function series(...sessions) { return a.trainingAnalytics(sessions, today)[0]; }
test('only completed working sets in finished non-future sessions contribute', () => {
  const done = session('done', '2026-11-01');
  done.exercises[0].sets.push({ id: 'warm', weightKg: 500, reps: 10, warmup: true, completed: true }, { id: 'planned', weightKg: 600, reps: 10, warmup: false, completed: false });
  const draft = session('draft', '2026-11-02', 900, 10, { finishedAt: null }); const future = session('future', '2026-11-04', 1000, 8);
  const result = series(future, draft, done); assert.equal(result.points.length, 1); assert.equal(result.points[0].volume, 480); assert.equal(result.points[0].sets, 1); assert.equal(result.records.load.value, 60);
  assert.equal(a.trainingAnalytics([draft, future], today).length, 0);
});
test('exercise keys normalize whitespace, case and Unicode but keep equipment and accents distinct', () => {
  assert.equal(a.exerciseKey('  PRESS   de BANCA '), 'press de banca'); assert.equal(a.exerciseKey('Flexio\u0301n'), a.exerciseKey('Flexión'));
  assert.notEqual(a.exerciseKey('Press barra'), a.exerciseKey('Press mancuerna')); assert.notEqual(a.exerciseKey('Flexión'), a.exerciseKey('Flexion'));
  const one = session('one', '2026-11-01'); const duplicate = structuredClone(one.exercises[0]); duplicate.id = 'other'; duplicate.name = ' SENTADILLA '; duplicate.sets[0].id = 'other-set'; one.exercises.push(duplicate);
  const group = series(one); assert.equal(group.points.length, 1); assert.equal(group.points[0].sets, 2); assert.equal(group.points[0].volume, 960);
});
test('multiple sessions on the same day remain separate and deterministic', () => {
  const earlier = session('earlier', '2026-11-01', 60); const later = session('later', '2026-11-01', 70, 6, { startedAt: earlier.startedAt + 2000 });
  const result = series(later, earlier); assert.deepEqual(result.points.map((row) => row.sessionId), ['earlier', 'later']); assert.equal(a.progressSummary(result.points).days, 1); assert.equal(a.progressSummary(result.points).sessions, 2);
  const tied = session('alpha', '2026-11-01', 80); const tied2 = session('zeta', '2026-11-01', 80); assert.equal(series(tied2, tied).records.load.reference.sessionId, 'alpha');
});
test('bodyweight and explicit zero preserve reps without inventing kilograms or 1RM', () => {
  const group = series(session('body', '2026-11-01', null, 20), session('zero', '2026-11-02', 0, 25));
  assert.equal(group.points[0].volume, null); assert.equal(group.points[1].volume, 0); assert.equal(group.records.load, undefined); assert.equal(group.records.estimated, undefined);
  assert.equal(group.records.reps.value, 25); const summary = a.progressSummary(group.points); assert.equal(summary.repetitions, 45); assert.equal(summary.volume, 0); assert.equal(summary.missingLoadSets, 1); assert.equal(summary.loadedSets, 0);
});
test('mixed loaded/bodyweight blocks expose partial volume and missing-load counts', () => {
  const data = session('mixed', '2026-11-01', 20, 10); data.exercises[0].sets.push({ id: 'unloaded', weightKg: null, reps: 12, completed: true, warmup: false });
  const point = series(data).points[0]; assert.equal(point.volume, 200); assert.equal(point.repetitions, 22); assert.equal(point.missingLoadSets, 1); assert.equal(point.loadedSets, 1);
});
test('historical records retain source sets and sessions; ties keep the first occurrence', () => {
  const group = series(session('first', '2026-10-01', 60, 8), session('tie', '2026-10-02', 60, 8), session('next', '2026-10-03', 65, 8));
  assert.equal(group.points[0].marks.length, 0); assert.equal(group.points[1].marks.length, 0); assert.ok(group.points[2].marks.includes('load'));
  assert.equal(group.records.load.value, 65); assert.equal(group.records.load.reference.setId, 'next-set'); assert.equal(group.records.volume.value, 520);
  assert.equal(group.records.reps.reference.sessionId, 'first'); assert.equal(group.records.estimated.value, 82.33);
});
test('volume records are rounded consistently rather than changing on floating-point ties', () => {
  const group = series(session('first', '2026-10-01', 3.3, 1), session('second', '2026-10-02', 1.1, 3));
  assert.equal(group.records.setVolume.reference.sessionId, 'first'); assert.equal(group.records.volume.reference.sessionId, 'first'); assert.equal(group.points[1].volume, 3.3);
});
test('Epley estimates use actual singles, exclude high reps and never use non-positive load', () => {
  assert.equal(a.estimatedMax(100, 1), 100); assert.equal(a.estimatedMax(60, 10), 80); assert.equal(a.estimatedMax(60, 11), null); assert.equal(a.estimatedMax(null, 6), null); assert.equal(a.estimatedMax(0, 6), null);
  assert.equal(series(session('hi', '2026-10-01', 80, 12)).records.estimated, undefined);
});
test('periods include exactly N civil dates across DST; record baselines use all history', () => {
  const group = series(session('old', '2026-01-01', 100), session('before', '2026-10-04', 50), session('first', '2026-10-05', 60), session('latest', today, 70));
  assert.deepEqual(a.periodPoints(group.points, '30', today).map((point) => point.sessionId), ['first', 'latest']);
  assert.equal(group.records.load.reference.sessionId, 'old'); assert.equal(group.points.at(-1).marks.includes('load'), false);
  assert.equal(a.periodPoints(group.points, '90', today).length, 3); assert.equal(a.periodPoints(group.points, 'all', today).length, 4);
});
test('weekly volume is Monday-based, sums multiple sessions and ignores out-of-period dates', () => {
  assert.equal(a.weekStart('2026-10-25'), '2026-10-19'); assert.equal(a.weekStart('2026-10-26'), '2026-10-26');
  const group = series(session('sun', '2026-10-25', 10, 10), session('mon1', '2026-10-26', 20, 10), session('mon2', '2026-10-26', 30, 10), session('today', today, null, 15));
  const weeks = a.weeklyVolume(group.points, '30', today); assert.equal(weeks.length, 3); assert.equal(weeks[1].volume, 500); assert.equal(weeks[1].sessions, 2); assert.equal(weeks[2].volume, null);
});
test('first-to-latest comparison handles declines, zero baselines and missing measurements', () => {
  const group = series(session('one', '2026-10-01', 80, 10), session('two', '2026-10-02', null, 20), session('three', '2026-10-03', 60, 5));
  assert.deepEqual(a.metricChange(group.points, 'load'), { first: 80, last: 60, difference: -20, percent: -25 });
  const zero = series(session('one', '2026-10-01', 0, 10), session('two', '2026-10-02', 10, 10)); assert.equal(a.metricChange(zero.points, 'volume').percent, null);
  assert.equal(a.metricChange(group.points.slice(0, 1), 'load'), null);
});
test('graphs handle zero, one point, missing gaps and narrow layouts with finite geometry', () => {
  const group = series(session('one', '2026-10-01', 20), session('two', '2026-10-02', null), session('three', '2026-10-03', 30));
  const graph = a.progressGeometry(group.points, 'load', 220); assert.equal(graph.paths.length, 2); assert.equal(graph.dots.length, 2); assert.equal(graph.dots[0].x, 8);
  const one = a.progressGeometry(group.points.slice(0, 1), 'load', 100); assert.equal(one.dots[0].x, 50);
  for (const width of [0, 10, NaN, Infinity]) assert.doesNotMatch(JSON.stringify(a.progressGeometry(group.points, 'load', width)), /NaN|Infinity/);
  assert.equal(a.progressGeometry(group.points.slice(1, 2), 'load', 200), null);
  const zero = series(session('zero', '2026-10-01', 0)); assert.equal(a.progressGeometry(zero.points, 'volume', 200).dots[0].y, 152);
});
test('reopening, editing or deleting a session recalculates records without stale derived rows', () => {
  const one = session('one', '2026-10-01', 60); const two = session('two', '2026-10-02', 70);
  assert.equal(series(one, two).records.load.value, 70); assert.equal(series(one, { ...two, finishedAt: null }).records.load.value, 60);
  const edited = structuredClone(two); edited.exercises[0].sets[0].weightKg = 50; assert.equal(series(one, edited).records.load.value, 60);
  assert.equal(series(one).records.load.value, 60); assert.equal(a.trainingAnalytics([], today).length, 0);
});
test('analytics are read-only and validate inputs rather than silently duplicating records', () => {
  const data = session('one', '2026-10-01'); const before = structuredClone(data); a.trainingAnalytics([data], today); assert.deepEqual(data, before);
  assert.throws(() => a.trainingAnalytics([data, data], today), /Duplicate/); const invalid = structuredClone(data); invalid.exercises[0].sets[0].reps = null;
  assert.throws(() => a.trainingAnalytics([invalid], today)); assert.throws(() => a.periodPoints([], 'other', today));
});
test('SQLite reopening and browser-store reopening reproduce identical offline analytics', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlc-analytics-')); const file = path.join(dir, 'db.sqlite'); let db = new DatabaseSync(file); db.exec(SCHEMA_SQL);
  const open = async () => ({ async getAllAsync(sql, ...params) { return db.prepare(sql).all(...params); }, async runAsync(sql, ...params) { return db.prepare(sql).run(...params); } });
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  let store = createTrainingStore(open); const data = [session('one', '2026-10-01', 60), session('two', '2026-10-08', 65)]; for (const row of data) await store.save(row);
  const expected = a.trainingAnalytics(data, today); db.close(); db = new DatabaseSync(file); store = createTrainingStore(open); assert.deepEqual(a.trainingAnalytics(await store.list(), today), expected);
  const memory = new Map(); const storage = { async getItem(key) { return memory.get(key) ?? null; }, async setItem(key, value) { memory.set(key, value); } };
  let web = createWebTrainingStore(storage); for (const row of data) await web.save(row); web = createWebTrainingStore(storage); assert.deepEqual(a.trainingAnalytics(await web.list(), today), expected);
});
