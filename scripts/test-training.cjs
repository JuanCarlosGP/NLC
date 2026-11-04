const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file,
}).outputText, file);
const model = require('../src/lib/health/training/model.ts');
const { createTrainingStore } = require('../src/lib/health/training/store.ts');
const { createWebTrainingStore, TRAINING_WEB_KEY } = require('../src/lib/health/training/web-store.ts');
const { createSessionSaveQueue } = require('../src/lib/health/training/save-queue.ts');
const { SCHEMA_SQL } = require('../src/lib/db/schema.ts');
function session() {
  const data = model.newSession('Fuerza A', '2026-11-03');
  const exercise = model.newExercise('Sentadilla');
  exercise.sets = [
    { ...model.newSet(), weightKg: 20, reps: 10, warmup: true, completed: true },
    { ...model.newSet(), weightKg: 60.5, reps: 8, completed: true },
    { ...model.newSet(), weightKg: 60.5, reps: 8 },
  ];
  data.exercises = [exercise]; return data;
}
function adapt(db) {
  return {
    async getAllAsync(sql, ...params) { return db.prepare(sql).all(...params); },
    async getFirstAsync(sql, ...params) { return db.prepare(sql).get(...params) ?? null; },
    async runAsync(sql, ...params) { return db.prepare(sql).run(...params); },
  };
}
test('completed working sets alone contribute volume; invalid sets cannot be finished', () => {
  const data = session();
  assert.deepEqual(model.sessionSummary(data), { exercises: 1, planned: 3, completed: 2, working: 1, volume: 484 });
  const wrong = structuredClone(data); wrong.exercises[0].sets[1].reps = null;
  assert.throws(() => model.validateSession(wrong), { code: 'sets' });
  wrong.exercises[0].sets[1].reps = 1.5;
  assert.throws(() => model.validateSession(wrong), { code: 'sets' });
  wrong.exercises[0].sets[1].reps = 8; wrong.exercises[0].sets[1].weightKg = -1;
  assert.throws(() => model.validateSession(wrong), { code: 'sets' });
  const empty = model.newSession('Empty'); empty.finishedAt = Date.now();
  assert.throws(() => model.validateSession(empty), { code: 'empty' });
  assert.throws(() => model.newSession('Invalid', '2026-02-30'), { code: 'date' });
});
test('repeating creates an independent draft with new identifiers and planned sets', () => {
  const source = session(); source.finishedAt = Date.now();
  const repeated = model.repeatSession(source, '2026-11-05');
  assert.notEqual(repeated.id, source.id); assert.equal(repeated.finishedAt, null); assert.equal(repeated.date, '2026-11-05');
  assert.notEqual(repeated.exercises[0].id, source.exercises[0].id);
  assert.notEqual(repeated.exercises[0].sets[0].id, source.exercises[0].sets[0].id);
  assert.equal(model.sessionSummary(repeated).completed, 0);
  assert.equal(repeated.exercises[0].restSec, source.exercises[0].restSec);
  repeated.exercises[0].sets[0].reps = 20; assert.equal(source.exercises[0].sets[0].reps, 10);
});
test('previous values come from earlier finished sessions and exclude planned sets', () => {
  const prior = session(); prior.startedAt = 100; prior.finishedAt = 200;
  const current = model.repeatSession(prior, prior.date); current.startedAt = 300;
  const future = model.repeatSession(prior, prior.date); future.startedAt = 400; future.finishedAt = 500;
  future.exercises[0].sets[0].weightKg = 999;
  const draft = model.repeatSession(prior, '2026-11-02');
  const result = model.previousExercise([future, current, draft, prior], current, ' sentadilla ');
  assert.equal(result.sets.length, 2); assert.equal(result.sets[0].weightKg, 20);
  assert.equal(model.previousExercise([current, draft], current, 'Sentadilla'), null);
});
test('calendar uses civil days across leap years, DST and year boundaries', () => {
  const feb = model.monthDays('2024-02').filter(Boolean);
  assert.equal(feb.length, 29); assert.equal(feb.at(-1), '2024-02-29');
  assert.equal(model.monthDays('2026-11')[6], '2026-11-01');
  for (const month of ['2026-03', '2026-10']) {
    const cells = model.monthDays(month); assert.equal(cells.length % 7, 0);
    assert.equal(cells.filter(Boolean).length, 31); assert.equal(new Set(cells.filter(Boolean)).size, 31);
  }
  assert.equal(model.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(model.shiftMonth('2026-01', -1), '2025-12');
});
test('schema upgrade preserves the version-7 health, music and wealth records', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/catalog-v7.sql'), 'utf8'));
    db.exec("INSERT INTO meta VALUES ('schema', '7'); INSERT INTO favorites VALUES (0, 'song')");
    db.exec("INSERT INTO health_weight_entries VALUES ('2026-11-03', 72.5, 'keep', 1, 1)");
    db.exec("INSERT INTO wealth_accounts (id,name,created_at) VALUES ('bank','Keep bank',1)");
    db.exec(SCHEMA_SQL); db.exec(SCHEMA_SQL);
    assert.equal(db.prepare('SELECT weight_kg FROM health_weight_entries').get().weight_kg, 72.5);
    assert.equal(db.prepare('SELECT track_id FROM favorites').get().track_id, 'song');
    assert.equal(db.prepare('SELECT name FROM wealth_accounts').get().name, 'Keep bank');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM health_training_sessions').get().n, 0);
  } finally { db.close(); }
});
test('SQLite resumes exercises, sets and timer after reopening, with multiple sessions per day', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlc-training-')); const file = path.join(dir, 'test.db');
  let db = new DatabaseSync(file); db.exec(SCHEMA_SQL);
  try {
    let store = createTrainingStore(async () => adapt(db));
    const data = session(); const second = model.repeatSession(data, data.date);
    await store.save(data); await store.save(second);
    const timer = { sessionId: data.id, exerciseName: 'Sentadilla', endsAt: 100000 };
    await store.setRest(timer); db.close(); db = new DatabaseSync(file); store = createTrainingStore(async () => adapt(db));
    assert.equal((await store.list()).length, 2);
    assert.deepEqual((await store.list()).find((row) => row.id === data.id), data);
    assert.deepEqual(await store.getRest(), timer);
    assert.equal(model.remainingRest(await store.getRest(), 70001), 30);
    data.date = '2026-11-04'; data.finishedAt = Date.now(); await store.save(data);
    assert.equal((await store.list())[0].date, '2026-11-04');
    await store.remove(second.id); assert.equal((await store.list()).length, 1);
    const bad = structuredClone(data); bad.exercises[0].sets[1].reps = -2;
    await assert.rejects(store.save(bad), { code: 'sets' });
    assert.deepEqual((await store.list())[0], data);
    await store.setRest(null); assert.equal(await store.getRest(), null);
  } finally { db.close(); fs.rmSync(dir, { recursive: true }); }
});
test('save queue serializes overlapping edits and retries the latest snapshot after a failure', async () => {
  let release; const gate = new Promise((resolve) => { release = resolve; }); const writes = [];
  const queue = createSessionSaveQueue(async (data) => { if (!writes.length) await gate; writes.push(data); });
  const first = session(); queue.put(first); const saving = queue.flush();
  const latest = { ...first, note: 'latest' }; queue.put(latest); release(); await saving;
  assert.equal(writes.at(-1).note, 'latest'); assert.equal(queue.dirty, false);
  let fail = true; let stored;
  const retry = createSessionSaveQueue(async (data) => { if (fail) throw new Error('Disk full'); stored = data; });
  retry.put(first); await assert.rejects(retry.flush()); assert.equal(retry.dirty, true);
  retry.put(latest); fail = false; await retry.flush(); assert.equal(stored.note, 'latest'); assert.equal(retry.dirty, false);
});
test('web fallback persists queued changes and preserves data on quota or corruption errors', async () => {
  const values = new Map(); let fail = false;
  const storage = { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { if (fail) throw new Error('Quota'); values.set(key, value); } };
  const data = session(); const other = model.repeatSession(data);
  let store = createWebTrainingStore(storage);
  await Promise.all([store.save(data), store.save(other), store.setRest({ sessionId: data.id, exerciseName: 'Squat', endsAt: 120000 })]);
  store = createWebTrainingStore(storage); assert.equal((await store.list()).length, 2); assert.equal((await store.getRest()).endsAt, 120000);
  fail = true; await assert.rejects(store.remove(data.id)); assert.equal((await store.list()).length, 2);
  fail = false; await store.remove(other.id); assert.equal((await store.list()).length, 1);
  values.set(TRAINING_WEB_KEY, '{bad'); await assert.rejects(store.list()); await assert.rejects(store.save(data));
  assert.equal(values.get(TRAINING_WEB_KEY), '{bad');
});
test('rest countdown uses a persisted deadline instead of counting foreground ticks', () => {
  const timer = { sessionId: 's', exerciseName: 'Squat', endsAt: 180000 };
  assert.equal(model.remainingRest(timer, 90000), 90); assert.equal(model.remainingRest(timer, 175001), 5);
  assert.equal(model.remainingRest(timer, 190000), 0); assert.equal(model.clock(90), '1:30');
  assert.throws(() => model.validateRest({ ...timer, endsAt: NaN }), { code: 'invalid' });
});
