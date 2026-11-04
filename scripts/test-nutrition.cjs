const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText, file);
const m = require('../src/lib/health/nutrition/model.ts');
const csv = require('../src/lib/health/nutrition/macrofactor.ts');
const { createSqlNutritionStore } = require('../src/lib/health/nutrition/store.ts');
const { createWebNutritionStore, WEB_NUTRITION_KEY } = require('../src/lib/health/nutrition/web-store.ts');
const { SCHEMA_SQL } = require('../src/lib/db/schema.ts');
const now = () => new Date(2026, 10, 3, 12).getTime();
const input = (date, calories = '2100,5') => ({ date, calories, protein: '140,2', carbs: '250', fat: '60', note: ' Test ' });
const header = 'Date,Time,Food Name,Calories (kcal),Protein (g),Carbs (g),Fat (g)';
const sample = `${header}\r\n2026-11-01,08:00,"Avena, con leche",400,20,50,10\r\n2026-11-01,14:15,"Pan ""integral""",500,30,60,15\r\n2026-11-02,08:00,Desayuno,350.25,18.5,40,12.1`;
function env(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlc-nutrition-')); const file = path.join(dir, 'db.sqlite'); let db = new DatabaseSync(file); db.exec(SCHEMA_SQL); let failAt = 0, writes = 0;
  const adapter = { async getAllAsync(sql, ...params) { return db.prepare(sql).all(...params); }, async runAsync(sql, ...params) { if (failAt && ++writes === failAt) throw new Error('Disk full'); return db.prepare(sql).run(...params); } };
  const tx = async (_, task) => { db.exec('BEGIN'); try { await task(); db.exec('COMMIT'); } catch (err) { db.exec('ROLLBACK'); throw err; } };
  const make = () => createSqlNutritionStore(async () => adapter, tx, now);
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { store: make(), get db() { return db; }, fail(value) { writes = 0; failAt = value; }, reopen() { db.close(); db = new DatabaseSync(file); return make(); } };
}
test('manual values require explicit valid numbers; decimal comma, zero and dates are supported', () => {
  const day = m.normalizeNutrition(input('2026-11-03'), '2026-11-03'); assert.equal(day.calories, 2100.5); assert.equal(day.note, 'Test');
  for (const value of ['', ' ', '-1', 'NaN', '1e3', '1.200,5', null, true, Infinity, 100001]) assert.throws(() => m.normalizeNutrition(input('2026-11-03', value), '2026-11-03'), { code: 'calories' });
  assert.equal(m.normalizeNutrition(input('2026-11-03', '0'), '2026-11-03').calories, 0);
  assert.throws(() => m.normalizeNutrition(input('2026-02-29'), '2026-11-03'), { code: 'date' }); assert.throws(() => m.normalizeNutrition(input('2026-11-04'), '2026-11-03'), { code: 'future' });
  assert.doesNotThrow(() => m.normalizeNutrition(input('2024-02-29'), '2026-11-03'));
});
test('MacroFactor foods with BOM, CRLF, commas and escaped quotes aggregate once per date', () => {
  const days = csv.parseMacroFactor('\ufeff' + sample, '2026-11-03'); assert.equal(days.length, 2); assert.equal(days[1].calories, 900); assert.equal(days[1].protein, 50); assert.equal(days[1].foods[0].name, 'Avena, con leche'); assert.equal(days[1].foods[1].name, 'Pan "integral"');
  assert.equal(days[0].fat, 12.1);
  const reordered = sample.split('\r\n'); assert.deepEqual(csv.parseMacroFactor([reordered[0], ...reordered.slice(1).reverse()].join('\n'), '2026-11-03'), days);
});
test('daily CSV, semicolons, decimal comma and tab-delimited files are accepted', () => {
  const text = 'Date;Calories (kcal);Protein (g);Carbs (g);Fat (g)\n2026-10-31;2100,5;140,2;250;60';
  const days = csv.parseMacroFactor(text, '2026-11-03'); assert.equal(days[0].calories, 2100.5); assert.equal(days[0].foods.length, 0);
  assert.equal(csv.parseMacroFactor(text.replaceAll(';', '\t'), '2026-11-03')[0].protein, 140.2);
});
test('invalid headers, malformed CSV, blanks, future dates and duplicate daily totals fail with a row', () => {
  assert.throws(() => csv.parseMacroFactor('Date,Weight\n2026-11-01,80'), { code: 'headers' });
  assert.throws(() => csv.parseMacroFactor(`${header}\n2026-11-01,08:00,"unclosed,400,20,50,10`), { code: 'csv' });
  assert.throws(() => csv.parseMacroFactor(sample.replace(',400,', ',, '), '2026-11-03'), { line: 2 });
  assert.throws(() => csv.parseMacroFactor(sample.replace('2026-11-01', '2026-11-04'), '2026-11-03'), { code: 'future', line: 2 });
  assert.throws(() => csv.parseMacroFactor(`${header}\n2026-11-01,08:00,Food,1,2,3,4,5`), { code: 'csv', line: 2 });
  assert.throws(() => csv.parseMacroFactor(`${header}\n2026-11-01,28:00,Food,1,2,3,4`), { code: 'food', line: 2 });
  assert.throws(() => csv.parseMacroFactor('Date,Calories,Protein,Carbs,Fat\n2026-11-01,1,2,3,4\n2026-11-01,5,6,7,8'), { code: 'duplicate', line: 3 });
  assert.throws(() => csv.parseMacroFactor(''), { code: 'empty' });
});
test('CSV size, row count, daily accumulated limits and non-ASCII byte sizes are bounded', () => {
  assert.throws(() => csv.csvRows('á'.repeat(csv.MAX_CSV_BYTES / 2 + 1)), { code: 'size' });
  assert.throws(() => csv.csvRows('A\n' + '1\n'.repeat(csv.MAX_CSV_ROWS + 1)), { code: 'size' });
  assert.throws(() => csv.parseMacroFactor(`${header}\n2026-11-01,08:00,One,60000,0,0,0\n2026-11-01,09:00,Two,60000,0,0,0`), { code: 'calories', line: 3 });
});
test('SQLite records and imported food breakdown survive reopening', async (t) => {
  const e = env(t); await e.store.save(input('2026-10-31')); await e.store.importDays(csv.parseMacroFactor(sample, '2026-11-03'));
  const store = e.reopen(); const rows = await store.list(); assert.equal(rows.length, 3); assert.equal(rows[1].foods.length, 2); assert.equal(rows[2].source, 'manual'); assert.equal(rows[2].calories, 2100.5);
});
test('one record per date; moving rejects collisions and preserves creation time', async (t) => {
  const { store } = env(t); await store.save(input('2026-10-30')); await store.save(input('2026-10-31'));
  const created = (await store.list()).find((day) => day.date === '2026-10-30').createdAt;
  await assert.rejects(store.save(input('2026-10-31')), { code: 'conflict' }); await assert.rejects(store.save(input('2026-10-31'), '2026-10-30'), { code: 'conflict' });
  const rows = await store.save(input('2026-10-29'), '2026-10-30'); assert.equal(rows.at(-1).createdAt, created); assert.equal(rows.length, 2);
  await assert.rejects(store.save(input('2026-10-28'), '2026-10-27'), { code: 'missing' });
});
test('default import preserves manual and existing days; replacement is explicit and keeps notes', async (t) => {
  const { store } = env(t); const incoming = csv.parseMacroFactor(sample, '2026-11-03'); await store.save(input('2026-11-01'));
  let result = await store.importDays(incoming); assert.deepEqual(result.result, { added: 1, replaced: 0, kept: 1, unchanged: 0, manual: 0 }); assert.equal(result.days[1].calories, 2100.5);
  result = await store.importDays(incoming, true); assert.equal(result.result.manual, 1); assert.equal(result.days[1].calories, 900); assert.equal(result.days[1].note, 'Test');
});
test('reimporting or reordering an export is idempotent and keeps timestamps', async (t) => {
  const { store } = env(t); const incoming = csv.parseMacroFactor(sample, '2026-11-03'); const first = await store.importDays(incoming); const next = await store.importDays(incoming, true);
  assert.equal(next.result.unchanged, 2); assert.deepEqual(next.days, first.days);
  const changed = csv.parseMacroFactor(sample.replace(',400,', ',450,'), '2026-11-03'); const replacement = await store.importDays(changed, true); assert.equal(replacement.days[1].calories, 950); assert.equal(replacement.days.length, 2);
});
test('a partial export only replaces its dates, and manual editing clears imported foods', async (t) => {
  const { store } = env(t); await store.importDays(csv.parseMacroFactor(sample, '2026-11-03')); await store.importDays(csv.parseMacroFactor(header + '\n2026-11-02,12:00,New,600,30,70,20', '2026-11-03'), true);
  let rows = await store.list(); assert.equal(rows[1].calories, 900); assert.equal(rows[0].calories, 600);
  rows = await store.save(input('2026-11-02', '2200'), '2026-11-02'); assert.equal(rows[0].source, 'manual'); assert.deepEqual(rows[0].foods, []);
});
test('SQL failures roll back complete batches, date moves and deletions; retry succeeds', async (t) => {
  const e = env(t); await e.store.save(input('2026-10-31')); const before = await e.store.list(); e.fail(2);
  await assert.rejects(e.store.importDays(csv.parseMacroFactor(sample, '2026-11-03'))); assert.deepEqual(await e.store.list(), before);
  e.fail(2); await assert.rejects(e.store.save(input('2026-10-30'), '2026-10-31')); assert.deepEqual(await e.store.list(), before);
  e.fail(1); await assert.rejects(e.store.remove('2026-10-31')); assert.deepEqual(await e.store.list(), before);
  e.fail(0); await e.store.importDays(csv.parseMacroFactor(sample, '2026-11-03')); assert.equal((await e.store.list()).length, 3);
});
test('queued manual writes and imports recompute conflicts without overwriting manual records', async (t) => {
  const { store } = env(t); await Promise.all([store.save(input('2026-11-01')), store.importDays(csv.parseMacroFactor(sample, '2026-11-03'))]);
  const rows = await store.list(); assert.equal(rows.length, 2); assert.equal(rows[1].source, 'manual');
});
test('browser storage persists across instances, reports corrupt data and preserves data on quota failure', async () => {
  const map = new Map(); let fail = false; const storage = { async getItem(key) { return map.get(key) ?? null; }, async setItem(key, value) { if (fail) throw new Error('Quota'); map.set(key, value); } };
  let store = createWebNutritionStore(storage, now); await store.save(input('2026-11-01')); store = createWebNutritionStore(storage, now); const before = await store.list(); fail = true;
  await assert.rejects(store.importDays(csv.parseMacroFactor(sample, '2026-11-03'))); assert.deepEqual(await store.list(), before);
  fail = false; await store.importDays(csv.parseMacroFactor(sample, '2026-11-03')); assert.equal((await store.list()).length, 2);
  map.set(WEB_NUTRITION_KEY, '{bad'); await assert.rejects(store.save(input('2026-10-01'))); assert.equal(map.get(WEB_NUTRITION_KEY), '{bad');
});
test('weekly averages ignore missing days but include explicitly recorded zero, across DST', () => {
  const days = [{ date: '2026-10-25', calories: 1000 }, { date: '2026-10-31', calories: 0 }, { date: '2026-10-24', calories: 9000 }];
  assert.deepEqual(m.nutritionWeek(days, '2026-10-31'), { count: 2, average: 500 });
});
test('schema 10 upgrade preserves body photos, medications, training and weight', () => {
  const db = new DatabaseSync(':memory:'); try {
    db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/schema-v10.sql'), 'utf8'));
    db.exec(`INSERT INTO health_body_reviews VALUES ('photo', '2026-10-01', '{"photos":{"front":{"id":"keep"}}}'); INSERT INTO health_training_sessions VALUES ('training','2026-10-01',1,'{}'); INSERT INTO health_medication_plans VALUES ('plan',1,'{}'); INSERT INTO health_weight_entries VALUES ('2026-10-01',80,'keep',1,1);`);
    db.exec(SCHEMA_SQL); db.exec(SCHEMA_SQL);
    assert.equal(db.prepare('SELECT payload FROM health_body_reviews').get().payload, '{"photos":{"front":{"id":"keep"}}}');
    for (const table of ['health_body_reviews', 'health_training_sessions', 'health_medication_plans', 'health_weight_entries']) assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM health_nutrition_days').get().count, 0);
  } finally { db.close(); }
});
