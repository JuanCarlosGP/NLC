const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file,
}).outputText, file);
const originalResolve = Module._resolveFilename;
const nativeShim = path.join(__dirname, '.test-react-native');
require.cache[nativeShim] = { id: nativeShim, filename: nativeShim, loaded: true,
  exports: { Platform: { OS: 'test', select: (options) => options.default } } };
Module._resolveFilename = function(request, parent, ...rest) {
  if (request === 'react-native') return nativeShim;
  if (request === 'expo-crypto') return originalResolve.call(this, 'node:crypto', parent, ...rest);
  if (request.startsWith('@/')) request = path.join(root, 'src', request.slice(2));
  return originalResolve.call(this, request, parent, ...rest);
};

let active;
const dbFile = path.join(root, 'src/lib/db/client.ts');
require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: { getDb: async () => active } };
const { SCHEMA_SQL } = require('../src/lib/db/schema.ts');
const { makeDemoFixture } = require('../src/lib/dev/demo-fixture.ts');
const wealth = require('../src/lib/wealth/store.ts');
const compute = require('../src/lib/wealth/compute.ts');
const focus = require('../src/lib/productivity/store.ts');
const reminders = require('../src/lib/reminders/store.ts');
const { relayLanGet } = require('../src/lib/nas/lan-proxy.ts');

function database(t) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA_SQL);
  db.exec('PRAGMA foreign_keys = ON');
  active = {
    async getAllAsync(sql, ...params) { return db.prepare(sql).all(...params); },
    async getFirstAsync(sql, ...params) { return db.prepare(sql).get(...params) ?? null; },
    async runAsync(sql, ...params) { return db.prepare(sql).run(...params); },
    async execAsync(sql) { db.exec(sql); },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try { await task(); db.exec('COMMIT'); }
      catch (err) { db.exec('ROLLBACK'); throw err; }
    },
  };
  t.after(() => db.close());
  return makeDemoFixture('2026-11-03');
}

test('demo balances reconcile across cash, savings, investments and goals', async (t) => {
  const fixture = database(t);
  await wealth.replaceWealth(fixture.wealth);
  const dump = await wealth.dumpWealth();
  assert.equal(dump.txs.length, 45);
  assert.equal(compute.accountBalance('demo-bank', dump.txs), 6790);
  assert.equal(compute.accountBalance('demo-savings', dump.txs), 2000);
  assert.equal(compute.accountBalance('demo-broker', dump.txs), 150);
  assert.equal(compute.accountBalance('cash', dump.txs), 175.5);
  assert.equal(compute.cashTotal(dump.accounts, dump.txs), 9115.5);
  assert.equal(compute.holdingsValue(dump.assets), 2660);
  assert.equal(compute.netWorth(dump.accounts, dump.assets, dump.txs), 11775.5);
  const emergency = compute.goalProgress(dump.goals[0], dump.accounts, dump.assets, dump.txs);
  assert.equal(emergency.current, 2000);
  assert.equal(emergency.onTrack, false, 'A stalled goal must not claim to be on track');
  assert.equal(compute.formatGoalEta(emergency).includes('You are on track'), false);
  assert.notEqual(compute.formatChartAxis(Date.now(), '1w'), 'common.today');
  assert.ok(dump.txs.every((tx, i) => !i || dump.txs[i - 1].bookedAt >= tx.bookedAt));
});

test('expense edits, transfers and their deletion preserve the ledger invariants', async (t) => {
  const fixture = database(t);
  await wealth.replaceWealth(fixture.wealth);
  const expense = await wealth.createTx({ kind: 'expense', amount: 12.5, title: 'Prueba', accountId: 'demo-bank' });
  assert.equal(compute.accountBalance('demo-bank', await wealth.listTx()), 6777.5);
  await wealth.updateTx(expense.id, { kind: 'expense', amount: 20, title: 'Corregido', accountId: 'demo-bank' });
  assert.equal(compute.accountBalance('demo-bank', await wealth.listTx()), 6770);
  await wealth.deleteTx(expense.id);
  const transfer = await wealth.createTx({ kind: 'transfer', amount: 100, title: 'Traspaso', accountId: 'demo-bank', counterAccountId: 'demo-savings' });
  assert.equal(compute.accountBalance('demo-bank', await wealth.listTx()), 6690);
  assert.equal(compute.accountBalance('demo-savings', await wealth.listTx()), 2100);
  assert.equal(compute.cashTotal(await wealth.listAccounts(), await wealth.listTx()), 9115.5);
  await wealth.deleteTx(transfer.id);
  assert.equal(compute.accountBalance('demo-bank', await wealth.listTx()), 6790);
});

test('buying and reversing an investment updates quantity and cost basis once', async (t) => {
  const fixture = database(t);
  await wealth.replaceWealth(fixture.wealth);
  const buy = await wealth.createTx({ kind: 'buy', amount: 105, title: 'Unidad de prueba', accountId: 'demo-broker', assetId: 'demo-etf', quantity: 1, unitPrice: 105 });
  assert.equal((await wealth.getAsset('demo-etf')).quantity, 13);
  assert.equal((await wealth.getAsset('demo-etf')).costBasis, 1245);
  assert.equal(compute.accountBalance('demo-broker', await wealth.listTx()), 45);
  await wealth.deleteTx(buy.id);
  assert.equal((await wealth.getAsset('demo-etf')).quantity, 12);
  assert.equal((await wealth.getAsset('demo-etf')).costBasis, 1140);
  assert.equal(compute.accountBalance('demo-broker', await wealth.listTx()), 150);
});

test('tasks support project/status filters, completion, search and deletion', async (t) => {
  const fixture = database(t);
  await focus.replaceProductivity(fixture);
  assert.equal((await focus.listTasks()).length, 9);
  assert.equal((await focus.listTasks({ includeArchived: true })).length, 10);
  assert.equal((await focus.listTasks({ status: 'doing' })).length, 2);
  const found = await focus.searchProductivity('presupuesto');
  assert.equal(found.tasks.length, 1);
  await focus.updateTask(found.tasks[0].id, { status: 'done', title: 'Presupuesto revisado' });
  assert.equal((await focus.getTask(found.tasks[0].id)).status, 'done');
  await focus.archiveProject('demo-home');
  assert.ok((await focus.listTasks()).every((task) => task.projectId !== 'demo-home'));
  await focus.archiveProject('demo-home', false);
  await focus.deleteTask(found.tasks[0].id);
  assert.equal(await focus.getTask(found.tasks[0].id), null);
});

test('reminders keep paused state and edit/delete the requested entry', async (t) => {
  const fixture = database(t);
  await reminders.replaceReminders(fixture.reminders);
  assert.equal((await reminders.listReminders()).length, 3);
  assert.equal((await reminders.getReminder('demo-reminder-3')).enabled, false);
  await reminders.updateReminder('demo-reminder-2', { title: 'Planificar el domingo', hour: 17, minute: 45, enabled: false });
  const changed = await reminders.getReminder('demo-reminder-2');
  assert.equal(changed.minute, 45);
  assert.equal(changed.enabled, false);
  await reminders.deleteReminder('demo-reminder-2');
  assert.equal(await reminders.getReminder('demo-reminder-2'), null);
  assert.equal((await reminders.listReminders()).length, 2);
});

test('media proxy preserves byte ranges and HEAD for seeking without downloading the full file', async (t) => {
  const previousFetch = global.fetch;
  const calls = [];
  t.after(() => { global.fetch = previousFetch; });
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), ...init });
    return new Response(init.method === 'HEAD' ? null : new Uint8Array(100), { status: 206,
      headers: { 'Content-Range': 'bytes 100-199/1000', 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4', 'Content-Length': '100' } });
  };
  const target = 'http://127.0.0.1:8086/Video/movie.mp4';
  const response = await relayLanGet(new Request(`http://localhost/api/nas-files?u=${encodeURIComponent(target)}`,
    { headers: { Range: 'bytes=100-199', 'If-Range': 'demo-etag' } }));
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 100);
  assert.equal(calls[0].headers.get('Range'), 'bytes=100-199');
  assert.equal(calls[0].headers.get('If-Range'), 'demo-etag');
  assert.equal(response.headers.get('Content-Range'), 'bytes 100-199/1000');
  await relayLanGet(new Request(`http://localhost/api/nas-files?u=${encodeURIComponent(target)}`, { method: 'HEAD' }));
  assert.equal(calls[1].method, 'HEAD');
});
