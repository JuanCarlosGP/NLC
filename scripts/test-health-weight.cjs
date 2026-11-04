// Node 22.5+; TypeScript is already a development dependency. No Expo runtime is needed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");

require.extensions[".ts"] = (mod, file) => {
  const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  mod._compile(result.outputText, file);
};

const { SCHEMA_SQL } = require("../src/lib/db/schema.ts");
const model = require("../src/lib/health/weight/model.ts");
const { createWeightStore } = require("../src/lib/health/weight/store.ts");
const { createWebWeightStore, WEB_WEIGHT_KEY } = require("../src/lib/health/weight/web-store.ts");

function adapt(db) {
  return {
    async getAllAsync(sql, ...values) { return db.prepare(sql).all(...values); },
    async getFirstAsync(sql, ...values) { return db.prepare(sql).get(...values) ?? null; },
    async runAsync(sql, ...values) { return db.prepare(sql).run(...values); },
  };
}
function sample(entryDate, weightKg) {
  return { entryDate, weightKg, note: "", createdAt: 1, updatedAt: 1 };
}

test("validates real dates and decimal input without accepting ambiguous numeric strings", () => {
  assert.equal(model.isDateKey("2024-02-29"), true);
  for (const date of ["2025-02-29", "2026-02-30", "2026-13-01", "2026-1-01", ""])
    assert.equal(model.isDateKey(date), false, date);
  assert.deepEqual(model.normalizeWeightInput({ entryDate: "2026-11-03", weightKg: "72,55", note: "  hello  " }),
    { entryDate: "2026-11-03", weightKg: 72.6, note: "hello" });
  for (const weightKg of ["", "72kg", "1e2", "72.3.1", NaN, Infinity, 19.9, 400.1])
    assert.throws(() => model.normalizeWeightInput({ entryDate: "2026-11-03", weightKg }), { code: "weight" });
});

test("seven-day statistics use calendar dates, including sparse records and DST boundaries", () => {
  const entries = [sample("2026-03-30", 74), sample("2026-03-29", 72), sample("2026-03-24", 70), sample("2026-03-23", 100)];
  const summary = model.weightSummary(entries);
  assert.equal(summary.average7d, 72);
  assert.equal(summary.changeKg, -26);
  assert.equal(model.shiftDateKey("2026-03-30", -6), "2026-03-24");
  assert.equal(model.shiftDateKey("2026-10-26", -6), "2026-10-20");
  assert.equal(model.weightChartPoints(entries).at(-1).average7d, 72);
  assert.equal(model.weightChartPoints(entries, "2026-03-30")[0].average7d, 72);
  assert.equal(model.weightSummary([sample("2026-11-03", 70)]).changeKg, null);
  assert.equal(model.weightSummary([]).latest, null);
  const months = model.weightMonths([sample("2025-12-31", 80), sample("2026-01-01", 70), sample("2026-01-03", 72)]);
  assert.deepEqual(months[0], { month: "2026-01", count: 2, average: 71, min: 70, max: 72 });
});

test("adding health tables to a version-6 database preserves existing NLC data", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(fs.readFileSync(path.join(__dirname, "fixtures/catalog-v6.sql"), "utf8"));
    db.exec("INSERT INTO meta VALUES ('schema', '6'); INSERT INTO meta VALUES ('nas_settings', 'keep-me')");
    db.exec("INSERT INTO wealth_accounts (id, name, created_at) VALUES ('bank', 'My bank', 1)");
    db.exec("INSERT INTO favorites VALUES (0, 'my-track')");
    db.exec(SCHEMA_SQL);
    db.exec(SCHEMA_SQL);
    assert.equal(db.prepare("SELECT value FROM meta WHERE key = 'nas_settings'").get().value, "keep-me");
    assert.equal(db.prepare("SELECT name FROM wealth_accounts WHERE id = 'bank'").get().name, "My bank");
    assert.equal(db.prepare("SELECT track_id FROM favorites").get().track_id, "my-track");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM health_weight_entries").get().n, 0);
  } finally { db.close(); }
});

test("SQLite weight entries survive reopening and edits do not overwrite another date", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlc-weight-"));
  const file = path.join(dir, "catalog.sqlite");
  let db = new DatabaseSync(file);
  db.exec(SCHEMA_SQL);
  try {
    const store = createWeightStore(async () => adapt(db));
    const first = await store.save({ entryDate: "2026-11-01", weightKg: 72, note: "Morning" });
    await store.save({ entryDate: "2026-11-01", weightKg: "71,5", note: "Corrected" });
    let rows = await store.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].createdAt, first.createdAt);
    db.close();
    db = new DatabaseSync(file);
    const reopened = createWeightStore(async () => adapt(db));
    assert.equal((await reopened.list())[0].note, "Corrected");
    await reopened.save({ entryDate: "2026-11-02", weightKg: 70 });
    await assert.rejects(reopened.save({ entryDate: "2026-11-02", weightKg: 80 }, "2026-11-01"), { code: "conflict" });
    assert.deepEqual((await reopened.list()).map((entry) => entry.weightKg), [70, 71.5]);
    await reopened.save({ entryDate: "2026-10-31", weightKg: 71.5 }, "2026-11-01");
    assert.deepEqual((await reopened.list()).map((entry) => entry.entryDate), ["2026-11-02", "2026-10-31"]);
    await reopened.remove("2026-10-31");
    assert.equal((await reopened.list()).length, 1);
    await assert.rejects(reopened.save({ entryDate: "2026-11-03", weightKg: 72 }, "2026-10-31"), { code: "missing" });
    await reopened.save({ entryDate: "2026-11-03", weightKg: 72 });
    assert.equal((await reopened.list()).length, 2);
  } finally { db.close(); fs.rmSync(dir, { recursive: true }); }
});

test("browser fallback survives a new store, serializes concurrent writes and keeps data on failures", async () => {
  const values = new Map();
  let failWrites = false;
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { if (failWrites) throw new Error("Storage full"); values.set(key, value); },
  };
  const store = createWebWeightStore(storage);
  await Promise.all([
    store.save({ entryDate: "2026-11-01", weightKg: 72 }),
    store.save({ entryDate: "2026-11-02", weightKg: 71 }),
  ]);
  const reopened = createWebWeightStore(storage);
  assert.equal((await reopened.list()).length, 2);
  await assert.rejects(reopened.save({ entryDate: "2026-11-02", weightKg: 80 }, "2026-11-01"), { code: "conflict" });
  failWrites = true;
  await assert.rejects(reopened.remove("2026-11-01"));
  assert.equal((await reopened.list()).length, 2);
  failWrites = false;
  await reopened.save({ entryDate: "2026-11-03", weightKg: 70 }, "2026-11-01");
  await reopened.remove("2026-11-02");
  assert.equal((await reopened.list())[0].entryDate, "2026-11-03");
  values.set(WEB_WEIGHT_KEY, "broken-json");
  await assert.rejects(createWebWeightStore(storage).list());
  await assert.rejects(createWebWeightStore(storage).save({ entryDate: "2026-11-04", weightKg: 69 }));
  assert.equal(values.get(WEB_WEIGHT_KEY), "broken-json");
});
