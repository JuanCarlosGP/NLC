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
const m = require('../src/lib/health/medication/model.ts');
const { createMedicationStore, createSqlMedicationStore, validateMedicationData } = require('../src/lib/health/medication/store.ts');
const { createWebMedicationStore, MEDICATION_WEB_KEY } = require('../src/lib/health/medication/web-store.ts');
const { SCHEMA_SQL } = require('../src/lib/db/schema.ts');
const now = new Date(2026, 10, 3, 22, 0).getTime();
const input = (extra = {}) => ({ name: 'Example', kind: 'medication', dose: 'Recorded text', note: '', times: ['08:00', '20:00'], frequency: 'daily', anchorDate: '2026-10-01', endDate: null, ...extra });
const plan = (extra = {}) => m.newMedicationPlan(input(extra), now, 'example');
const data = (extra = {}) => ({ plans: [plan(extra)], logs: [], alertsEnabled: false });
function adapt(db) {
  return {
    async getAllAsync(sql, ...params) { return db.prepare(sql).all(...params); },
    async getFirstAsync(sql, ...params) { return db.prepare(sql).get(...params) ?? null; },
    async runAsync(sql, ...params) { return db.prepare(sql).run(...params); },
  };
}
test('schedule validation rejects ambiguous times, duplicates, invalid dates and excessive fields', () => {
  assert.deepEqual(m.parseTimes('20:00, 08:00'), ['08:00', '20:00']); assert.deepEqual(m.parseTimes(' '), []);
  for (const time of ['8:00', '24:00', '08:00,08:00', '08:00,', '12:60']) assert.throws(() => m.parseTimes(time), { code: 'time' });
  assert.throws(() => plan({ anchorDate: '2026-02-30' }), { code: 'date' });
  assert.throws(() => plan({ endDate: '2026-09-30' }), { code: 'date' });
  assert.throws(() => plan({ frequency: 'sometimes' }), { code: 'frequency' });
  assert.throws(() => plan({ name: ' ' }), { code: 'name' });
  assert.throws(() => plan({ note: 'x'.repeat(2001) }), { code: 'note' });
});
test('daily, alternate and weekly schedules use civil dates across daylight saving changes', () => {
  const revision = plan({ frequency: 'alternate', anchorDate: '2026-03-28' }).revisions[0];
  assert.equal(m.isDue(revision, '2026-03-28'), true); assert.equal(m.isDue(revision, '2026-03-29'), false); assert.equal(m.isDue(revision, '2026-03-30'), true);
  const weekly = plan({ frequency: 'weekly', anchorDate: '2026-10-23', endDate: '2026-10-30' }).revisions[0];
  assert.equal(m.isDue(weekly, '2026-10-30'), true); assert.equal(m.isDue(weekly, '2026-11-06'), false); assert.equal(m.isDue(weekly, '2026-10-22'), false);
});
test('monthly schedules clamp to the last day of short months without drifting', () => {
  const revision = plan({ frequency: 'monthly', anchorDate: '2024-01-31' }).revisions[0];
  assert.equal(m.isDue(revision, '2024-02-29'), true); assert.equal(m.isDue(revision, '2024-03-31'), true);
  assert.equal(m.isDue(revision, '2024-03-29'), false); assert.equal(m.isDue(revision, '2025-02-28'), true);
});
test('schedule edits and pauses preserve earlier history and recorded dose snapshots', () => {
  let state = data(); const original = state.plans[0];
  const log = m.makeDoseLog(state, { planId: original.id, date: '2026-11-03', time: '08:00', status: 'taken', actualTime: '08:15' }, now);
  state.logs.push(log);
  state.plans[0] = m.revisePlan(original, input({ name: 'Changed', dose: 'Changed text', times: ['10:00'] }), true, '2026-11-03', now);
  assert.equal(m.slotsForDay(state, '2026-11-02')[0].snapshot.name, 'Example');
  const today = m.slotsForDay(state, '2026-11-03'); assert.equal(today.length, 2);
  assert.equal(today.find((slot) => slot.time === '08:00').snapshot.dose, 'Recorded text');
  const current = state.plans[0]; state.plans[0] = m.revisePlan(current, current.revisions.at(-1), false, '2026-11-03', now);
  assert.equal(state.plans[0].revisions.length, 2); assert.equal(m.slotsForDay(state, '2026-11-04').length, 0);
  assert.equal(m.slotsForDay(state, '2026-11-03').length, 1); assert.equal(m.slotsForDay(state, '2026-11-02').length, 2);
});
test('each time slot is independent and skipped or pending are never counted as taken', () => {
  const state = data(); const add = (time, status) => {
    const log = m.makeDoseLog(state, { planId: 'example', date: '2026-11-03', time, status, actualTime: '21:00' }, now);
    state.logs = [...state.logs.filter((row) => row.id !== log.id), log];
  };
  add('08:00', 'taken'); add('20:00', 'skipped');
  assert.deepEqual(m.doseSummary(m.slotsForDay(state, '2026-11-03')), { total: 2, taken: 1, skipped: 1, pending: 0 });
  add('08:00', 'taken'); assert.equal(state.logs.length, 2);
  add('08:00', 'pending'); assert.equal(state.logs.length, 2);
  assert.deepEqual(m.doseSummary(m.slotsForDay(state, '2026-11-03')), { total: 2, taken: 0, skipped: 1, pending: 1 });
  assert.equal(m.slotsForDay(data({ times: [] }), '2026-11-03')[0].time, '');
});
test('future, non-scheduled and non-existent local dose times cannot be recorded', () => {
  const state = data();
  assert.throws(() => m.makeDoseLog(state, { planId: 'example', date: '2026-11-04', time: '08:00', status: 'taken' }, now), { code: 'future' });
  assert.throws(() => m.makeDoseLog(state, { planId: 'example', date: '2026-11-03', time: '09:00', status: 'taken' }, now), { code: 'missing' });
  assert.throws(() => m.makeDoseLog(state, { planId: 'example', date: '2026-11-03', time: '08:00', status: 'taken', actualTime: '23:00' }, now), { code: 'future' });
  const previousTZ = process.env.TZ;
  try { process.env.TZ = 'Europe/Madrid'; assert.throws(() => m.localDoseTimestamp('2026-03-29', '02:30'), { code: 'time' }); }
  finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});
test('schema upgrade from v8 preserves weight, training and library data', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/catalog-v8.sql'), 'utf8'));
    db.exec("INSERT INTO meta VALUES ('schema','8'); INSERT INTO favorites VALUES (0,'keep-track'); INSERT INTO health_weight_entries VALUES ('2026-11-03',72,'keep',1,1)");
    db.prepare('INSERT INTO health_training_sessions VALUES (?,?,?,?)').run('keep-session', '2026-11-03', 1, '{"keep":true}');
    db.exec(SCHEMA_SQL); db.exec(SCHEMA_SQL);
    assert.equal(db.prepare('SELECT track_id FROM favorites').get().track_id, 'keep-track');
    assert.equal(db.prepare('SELECT weight_kg FROM health_weight_entries').get().weight_kg, 72);
    assert.equal(db.prepare('SELECT id FROM health_training_sessions').get().id, 'keep-session');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM health_medication_plans').get().n, 0);
  } finally { db.close(); }
});
test('SQLite persists plans, independent dose records, corrections and settings after reopening', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlc-medication-')); const file = path.join(dir, 'test.db');
  let db = new DatabaseSync(file); db.exec(SCHEMA_SQL); db.exec('PRAGMA foreign_keys=ON');
  try {
    let store = createSqlMedicationStore(async () => adapt(db), () => now);
    const first = await store.savePlan(input()); const id = first.plans[0].id;
    await Promise.all([
      store.record({ planId: id, date: '2026-11-03', time: '08:00', status: 'taken', actualTime: '08:20', note: 'Keep note' }),
      store.record({ planId: id, date: '2026-11-03', time: '20:00', status: 'skipped' }),
      store.setAlerts(true),
    ]);
    db.close(); db = new DatabaseSync(file); store = createSqlMedicationStore(async () => adapt(db), () => now);
    let result = await store.read(); assert.equal(result.logs.length, 2); assert.equal(result.alertsEnabled, true);
    const previousTZ = process.env.TZ;
    try { process.env.TZ = 'Pacific/Auckland'; assert.doesNotThrow(() => validateMedicationData(result)); }
    finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
    await store.record({ planId: id, date: '2026-11-03', time: '08:00', status: 'taken', actualTime: '08:30' });
    result = await store.read(); assert.equal(result.logs.length, 2); assert.equal(result.logs.find((log) => log.time === '08:00').actualTime, '08:30');
    await store.savePlan(input(), id, false); result = await store.read();
    assert.equal(m.slotsForDay(result, '2026-11-04').length, 0); assert.equal(m.slotsForDay(result, '2026-11-03').length, 2);
  } finally { db.close(); fs.rmSync(dir, { recursive: true }); }
});
test('failed writes keep prior data intact and can be retried without duplicate completions', async () => {
  const db = new DatabaseSync(':memory:'); db.exec(SCHEMA_SQL); let failWrite = false; const adapter = adapt(db);
  const guarded = { ...adapter, async runAsync(...args) { if (failWrite) throw new Error('Disk full'); return adapter.runAsync(...args); } };
  try {
    const store = createSqlMedicationStore(async () => guarded, () => now);
    const first = await store.savePlan(input()); const id = first.plans[0].id;
    failWrite = true; await assert.rejects(store.record({ planId: id, date: '2026-11-03', time: '08:00', status: 'taken', actualTime: '08:00' }));
    assert.equal((await store.read()).logs.length, 0);
    failWrite = false; await store.record({ planId: id, date: '2026-11-03', time: '08:00', status: 'taken', actualTime: '08:00' });
    assert.equal((await store.read()).logs.length, 1);
  } finally { db.close(); }
});
test('web fallback survives new instances and preserves data after quota or corruption failures', async () => {
  const values = new Map(); let failWrite = false;
  const storage = { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { if (failWrite) throw new Error('Quota'); values.set(key, value); } };
  let store = createWebMedicationStore(storage);
  await Promise.all([store.savePlan(input()), store.savePlan(input({ name: 'Supplement', kind: 'supplement', times: [] }))]);
  store = createWebMedicationStore(storage); assert.equal((await store.read()).plans.length, 2);
  failWrite = true; await assert.rejects(store.setAlerts(true)); assert.equal((await store.read()).alertsEnabled, false);
  failWrite = false; await store.setAlerts(true); assert.equal((await store.read()).alertsEnabled, true);
  values.set(MEDICATION_WEB_KEY, '{broken'); await assert.rejects(store.read()); await assert.rejects(store.savePlan(input()));
  assert.equal(values.get(MEDICATION_WEB_KEY), '{broken');
});
test('local alerts are bounded, chronological and exclude taken, paused, untimed and elapsed doses', () => {
  const state = data(); state.alertsEnabled = true;
  const morning = new Date(2026, 10, 3, 7).getTime();
  state.logs.push(m.makeDoseLog(state, { planId: 'example', date: '2026-11-03', time: '08:00', status: 'taken', actualTime: '06:30' }, morning));
  const alerts = m.upcomingMedicationAlerts(state, morning);
  assert.equal(alerts.length, 40); assert.equal(alerts[0].time, '20:00'); assert.equal(alerts[0].date, '2026-11-03');
  assert.ok(alerts.every((alert, i) => alert.at > morning && (!i || alerts[i - 1].at <= alert.at)));
  state.alertsEnabled = false; assert.equal(m.upcomingMedicationAlerts(state, morning).length, 0);
  const untimed = data({ times: [] }); untimed.alertsEnabled = true; assert.equal(m.upcomingMedicationAlerts(untimed, morning).length, 0);
  state.alertsEnabled = true; state.plans[0] = m.revisePlan(state.plans[0], input(), false, '2026-11-03', morning);
  assert.equal(m.upcomingMedicationAlerts(state, morning).length, 0);
});
