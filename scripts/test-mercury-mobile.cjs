const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.tsx'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: file,
}).outputText, file);
const { fetchMercurySnapshot, MercuryError, normalizeMercuryToken } = require('../src/lib/integrations/mercury-api.ts');
const { createMobileMercury, MERCURY_SYNC_INTERVAL } = require('../src/lib/integrations/mercury-mobile.ts');
const { mercuryExample } = require('../src/lib/integrations/mercury-demo.ts');
const { createIntegrationCache } = require('../src/lib/integrations/cache.ts');
const { validateSnapshot, mercuryBalances } = require('../src/lib/integrations/model.ts');
const now = Date.parse('2026-11-04T12:00:00Z');
const json = (value, init = {}) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', ...init.headers }, ...init });
const page = (key, rows, nextPage = null) => ({ [key]: rows, page: { nextPage } });
function provider(options = {}) {
  const calls = [];
  async function fetch(url, init) {
    const u = new URL(url); calls.push({ url: u, init });
    assert.equal(u.origin, 'https://api.mercury.com'); assert.equal(init.method, 'GET');
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-token');
    if (options.reply) { const reply = await options.reply(u, init, calls); if (reply) return reply; }
    const p = u.pathname.replace('/api/v1', '');
    if (p === '/organization') return json({ organization: { id: 'org-a', ein: 'private-ein', legalBusinessName: 'not-persisted' } });
    if (p === '/accounts') return json(page('accounts', [{ id: 'a', name: 'Checking', accountNumber: '123456789012', routingNumber: '777777777', currentBalance: 1000, availableBalance: 900, status: 'active' }]));
    if (p === '/credit') return json({ accounts: [{ id: 'c', currentBalance: -120, availableBalance: -180, status: 'active' }] });
    if (p === '/treasury') return json(page('accounts', [{ id: 't', currentBalance: 500, availableBalance: 500, status: 'active', netReturns: [{ month: '2026-11-01', netAmount: 10, treasuryFee: 1, status: 'charged' }] }]));
    if (p === '/categories') return json(page('categories', [{ id: 'software', name: 'Software' }]));
    if (p === '/transactions') return json(page('transactions', [{ id: 'tx', accountId: 'a', amount: -30, createdAt: '2026-11-04T12:00:00Z', currencyExchangeInfo: { convertedToCurrency: 'EUR' }, details: { privateData: 'private-details' }, categoryData: { id: 'software' }, status: 'pending' }]));
    if (p === '/treasury/t/transactions') return json({ transactions: [{ id: 'tt', amount: -5, canonicalDay: '2026-11-03', description: 'Cancelled deposit', type: 'depositCanceled' }], cursor: null });
    throw new Error('Unexpected endpoint ' + p);
  }
  return { calls, fetch };
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const live = (at = now, owner = 'mercury:org-a') => ({ ...mercuryExample(new Date(at).toISOString()), mode: 'live', owner });
function harness(options = {}) {
  let clock = now; let stored = Object.hasOwn(options, 'token') ? options.token : 'synthetic-token'; let current = options.current ?? null;
  let failRead = false, failWrite = false, failDelete = false, failSave = false;
  const writes = [], saved = [], calls = [];
  const secrets = {
    async read() { if (failRead) throw new Error('secure storage'); return stored; },
    async write(value) { if (failWrite) throw new Error('secure storage'); stored = value; writes.push(value); },
    async remove() { if (failDelete) throw new Error('secure storage'); stored = null; },
  };
  const config = { secrets, current: () => current, now: () => clock,
    collect: async (token, signal) => { calls.push({ token, signal }); return options.collect ? options.collect(token, signal) : live(clock); },
    save: async value => { if (failSave) throw new Error('sqlite'); current = value; saved.push(value); }, ...options.config };
  const controller = createMobileMercury(config);
  return { controller, calls, writes, saved, secrets, current: () => current, stored: () => stored, setTime: value => { clock = value; },
    fail: (key, value = true) => { if (key === 'read') failRead = value; if (key === 'write') failWrite = value; if (key === 'delete') failDelete = value; if (key === 'save') failSave = value; } };
}
test('native Mercury makes only authenticated HTTPS reads, uses stable organization identity and strips bank details', async () => {
  const p = provider(); const snapshot = await fetchMercurySnapshot('synthetic-token', p.fetch, undefined, () => now);
  validateSnapshot(snapshot); assert.equal(snapshot.owner, 'mercury:org-a');
  assert.deepEqual(mercuryBalances(snapshot), { assets: 1500, credit: -120, total: 1380 });
  assert.equal(snapshot.accounts[0].last4, '9012'); assert.equal(snapshot.transactions[0].currency, 'USD');
  assert.equal(snapshot.transactions[0].category, 'Software'); assert.equal(snapshot.transactions.find(v => v.surface === 'treasury').status, 'cancelled');
  assert.doesNotMatch(JSON.stringify(snapshot), /synthetic-token|123456789012|777777777|private-ein|private-details|routingNumber|legalBusinessName/);
  assert.equal(p.calls.length, 7); assert.ok(p.calls.every(c => !c.url.searchParams.has('token')));
});
test('all cursor pages are collected and Treasury cursor zero is followed; repeated IDs update instead of doubling', async () => {
  const p = provider({ reply: async u => {
    if (u.pathname.endsWith('/transactions') && !u.pathname.includes('/treasury/')) return json(page('transactions', [{ id: 'tx', accountId: 'a', amount: -2, createdAt: '2026-11-04T12:00:00Z', status: u.searchParams.has('start_after') ? 'sent' : 'pending' }], u.searchParams.has('start_after') ? null : 'tx'));
    if (u.pathname.includes('/treasury/t/')) return json({ transactions: [{ id: u.searchParams.has('cursor') ? 'second' : 'first', amount: 1, canonicalDay: '2026-11-03' }], cursor: u.searchParams.has('cursor') ? null : 0 });
  } });
  const data = await fetchMercurySnapshot('synthetic-token', p.fetch);
  assert.equal(data.transactions.length, 3); assert.equal(data.transactions.find(v => v.id === 'depository:tx').status, 'sent');
  assert.ok(p.calls.some(c => c.url.searchParams.get('cursor') === '0'));
});
test('cursor loops and malformed pages fail instead of returning a partial history', async () => {
  for (const payload of [page('accounts', [{ id: 'a', currentBalance: 1 }], 'same'), { accounts: [] }]) {
    const p = provider({ reply: u => u.pathname.endsWith('/accounts') ? json(payload) : null });
    await assert.rejects(fetchMercurySnapshot('synthetic-token', p.fetch), error => error instanceof MercuryError && ['pagination', 'invalid'].includes(error.code));
  }
});
test('authentication, server errors and rate limits expose only safe codes, including Retry-After', async () => {
  for (const [status, code] of [[401, 'auth'], [403, 'auth'], [500, 'upstream'], [429, 'rateLimit']]) {
    const p = provider({ reply: () => new Response('do not leak synthetic-token', { status, headers: { 'retry-after': '120' } }) });
    await assert.rejects(fetchMercurySnapshot('synthetic-token', p.fetch, undefined, () => now), error => {
      assert.equal(error.code, code); assert.doesNotMatch(error.message, /synthetic-token|do not leak/);
      if (status === 429) assert.equal(error.retryAt, now + 120000); return true;
    });
  }
});
test('a partial failure, a foreign currency or broken account reference never produces a usable snapshot', async () => {
  const cases = [
    u => u.pathname.endsWith('/categories') ? new Response('error', { status: 500 }) : null,
    u => u.pathname.endsWith('/accounts') ? json(page('accounts', [{ id: 'a', currentBalance: 1, currency: 'EUR' }])) : null,
    u => u.pathname.endsWith('/transactions') && !u.pathname.includes('/treasury/') ? json(page('transactions', [{ id: 'x', accountId: 'unknown', amount: 1, createdAt: '2026-11-04' }])) : null,
  ];
  for (const reply of cases) await assert.rejects(fetchMercurySnapshot('synthetic-token', provider({ reply }).fetch), MercuryError);
});
test('response size, invalid JSON and cancellation are bounded before saving data', async () => {
  const responses = [new Response('{}', { headers: { 'content-length': String(17 * 1024 * 1024) } }), new Response('{')];
  for (const response of responses) { let signal; await assert.rejects(fetchMercurySnapshot('synthetic-token', async (_url, init) => { signal = init.signal; return response; }), MercuryError); assert.equal(signal.aborted, true); }
  const abort = new AbortController(); abort.abort(); let requested = false;
  await assert.rejects(fetchMercurySnapshot('synthetic-token', async () => { requested = true; }, abort.signal), error => error.code === 'cancelled'); assert.equal(requested, false);
  assert.throws(() => normalizeMercuryToken('Bearer synthetic-token'), /token/); assert.throws(() => normalizeMercuryToken('a'.repeat(1801)), /token/);
});
test('examples are generated fully offline and remain separate from a real cached account', async () => {
  const memory = new Map(); const cache = createIntegrationCache({ getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => memory.set(key, value), removeItem: async key => memory.delete(key) });
  await cache.write(live()); await cache.write(mercuryExample());
  assert.equal((await cache.read('mercury', 'live')).owner, 'mercury:org-a'); assert.equal((await cache.read('mercury', 'demo')).mode, 'demo');
});
test('no token leaves setup available, and only the secure store receives a configured token', async () => {
  const h = harness({ token: null }); await h.controller.load();
  assert.equal(h.controller.getSnapshot().ready, true); assert.equal(h.controller.getSnapshot().configured, false);
  assert.equal(await h.controller.tick(), 'skipped'); assert.equal(h.calls.length, 0);
  await h.controller.configure('  new-synthetic-token  '); assert.equal(h.stored(), 'new-synthetic-token');
  assert.doesNotMatch(JSON.stringify(h.controller.getSnapshot()), /new-synthetic-token/); assert.equal(h.saved.length, 0);
});
test('foreground sync is automatic when due and single-flight across automatic and manual requests', async () => {
  const gate = deferred(); const h = harness({ collect: () => gate.promise }); await h.controller.load();
  const first = h.controller.tick(); const second = h.controller.sync(); assert.equal(first, second);
  await Promise.resolve(); assert.equal(h.calls.length, 1); gate.resolve(live()); assert.equal(await first, 'saved'); assert.equal(h.saved.length, 1);
  assert.equal(await h.controller.tick(), 'skipped'); h.setTime(now + MERCURY_SYNC_INTERVAL + 1);
  assert.equal(await h.controller.tick(), 'saved'); assert.equal(h.calls.length, 2);
});
test('a late network failure preserves the previous complete copy and backs off before retrying', async () => {
  const previous = live(now - MERCURY_SYNC_INTERVAL - 1); let failed = true;
  const h = harness({ current: previous, collect: async () => { if (failed) throw new MercuryError('network'); return live(now + 30000); } }); await h.controller.load();
  await assert.rejects(h.controller.tick(), /network/); assert.equal(h.current(), previous); assert.equal(h.saved.length, 0);
  assert.equal(await h.controller.tick(), 'skipped'); assert.equal(h.calls.length, 1); failed = false; h.setTime(now + 30000);
  assert.equal(await h.controller.tick(), 'saved'); assert.equal(h.controller.getSnapshot().error, null);
});
test('rate limiting blocks early manual retries and auth failures do not loop automatically', async () => {
  for (const code of ['rateLimit', 'auth']) {
    const h = harness({ collect: async () => { throw new MercuryError(code, now + 120000); } }); await h.controller.load();
    await assert.rejects(h.controller.tick()); assert.equal(await h.controller.tick(), 'skipped'); assert.equal(h.calls.length, 1);
    if (code === 'rateLimit') { await assert.rejects(h.controller.sync(), /rateLimit/); assert.equal(h.calls.length, 1); }
    await h.controller.configure('another-synthetic-token'); await assert.rejects(h.controller.sync()); assert.equal(h.calls.length, 2);
  }
});
test('another organization needs explicit confirmation before replacing a saved account', async () => {
  const previous = live(now - MERCURY_SYNC_INTERVAL - 1); const next = live(now, 'mercury:org-b');
  const h = harness({ current: previous, collect: async () => next }); await h.controller.load();
  assert.equal(await h.controller.tick(), 'pending'); assert.equal(h.current(), previous); assert.equal(h.saved.length, 0);
  assert.equal(await h.controller.tick(), 'skipped'); await h.controller.acceptPending(); assert.equal(h.current(), next);
  assert.equal(h.controller.getSnapshot().pending, null); assert.equal(h.saved.length, 1);
});
test('rejecting an account change keeps the previous copy without recurring automatic prompts', async () => {
  const previous = live(now - MERCURY_SYNC_INTERVAL - 1); const h = harness({ current: previous, collect: async () => live(now, 'mercury:org-b') }); await h.controller.load();
  await h.controller.tick(); h.controller.rejectPending(); assert.equal(h.current(), previous); assert.equal(await h.controller.tick(), 'skipped'); assert.equal(h.calls.length, 1);
});
test('disconnect cancels in-flight work, erases the token and retains the offline copy', async () => {
  const gate = deferred(); const previous = live(now - MERCURY_SYNC_INTERVAL - 1); const h = harness({ current: previous, collect: () => gate.promise }); await h.controller.load();
  const syncing = h.controller.sync(); await Promise.resolve(); await h.controller.disconnect();
  assert.equal(h.calls[0].signal.aborted, true); gate.resolve(live()); assert.equal(await syncing, 'cancelled');
  assert.equal(h.stored(), null); assert.equal(h.controller.getSnapshot().configured, false); assert.equal(h.current(), previous); assert.equal(h.saved.length, 0);
});
test('background cancellation and token replacement cannot commit a stale network reply', async () => {
  for (const action of ['cancel', 'configure']) {
    const gate = deferred(); const h = harness({ collect: () => gate.promise }); await h.controller.load(); const syncing = h.controller.sync(); await Promise.resolve();
    if (action === 'cancel') h.controller.cancel(); else await h.controller.configure('replacement-token');
    gate.resolve(live()); assert.equal(await syncing, 'cancelled'); assert.equal(h.saved.length, 0);
    assert.equal(h.controller.getSnapshot().busy, false);
  }
});
test('secure storage failures never fall back to plaintext or replace data; configuration can recover', async () => {
  const previous = live(); const h = harness({ current: previous }); h.fail('read'); await h.controller.load();
  assert.equal(h.controller.getSnapshot().error, 'storage'); assert.equal(await h.controller.tick(), 'skipped'); assert.equal(h.calls.length, 0);
  h.fail('read', false); h.fail('write'); await assert.rejects(h.controller.configure('new-synthetic-token'), /storage/);
  assert.equal(h.current(), previous); assert.equal(h.saved.length, 0); h.fail('write', false); await h.controller.configure('new-synthetic-token');
  assert.equal(h.controller.getSnapshot().configured, true); assert.equal(h.stored(), 'new-synthetic-token');
  h.fail('delete'); await assert.rejects(h.controller.disconnect(), /storage/); assert.equal(h.controller.getSnapshot().configured, true);
});
test('failed SQLite saves preserve the old copy and leave a changed-account confirmation retryable', async () => {
  const previous = live(now - MERCURY_SYNC_INTERVAL - 1); const h = harness({ current: previous }); await h.controller.load(); h.fail('save');
  await assert.rejects(h.controller.sync(), /storage/); assert.equal(h.current(), previous); assert.equal(h.controller.getSnapshot().error, 'storage');
  const changed = harness({ current: previous, collect: async () => live(now, 'mercury:org-b') }); await changed.controller.load(); await changed.controller.tick(); changed.fail('save');
  await assert.rejects(changed.controller.acceptPending(), /storage/); assert.ok(changed.controller.getSnapshot().pending); assert.equal(changed.current(), previous);
  changed.fail('save', false); await changed.controller.acceptPending(); assert.equal(changed.current().owner, 'mercury:org-b');
});
test('configuration writes are serialized so a queued disconnect wins; a late initial read cannot undo setup', async () => {
  const gate = deferred(); let stored = 'old-synthetic-token';
  const h = harness({ config: { secrets: { read: async () => { await gate.promise; return stored; }, write: async value => { stored = value; }, remove: async () => { stored = null; } } } });
  const loading = h.controller.load(); const setting = h.controller.configure('new-synthetic-token'); const disconnecting = h.controller.disconnect();
  gate.resolve(); await Promise.all([loading, setting, disconnecting]); assert.equal(stored, null); assert.equal(h.controller.getSnapshot().configured, false);
});
test('automatic sync respects cache-load failures and a backwards device clock does not freeze refresh forever', async () => {
  const blocked = harness({ config: { allowAutomatic: () => false } }); await blocked.controller.load(); assert.equal(await blocked.controller.tick(), 'skipped'); assert.equal(blocked.calls.length, 0);
  const h = harness({ current: live(now + 60000) }); await h.controller.load(); assert.equal(await h.controller.tick(), 'saved'); assert.equal(h.calls.length, 1);
});
test('cold reopening restores the credential and copy independently; neither cache nor snapshots contain credentials', async () => {
  const h = harness(); await h.controller.load(); await h.controller.sync(); const reopened = createMobileMercury({ secrets: h.secrets, current: h.current, save: async () => {}, collect: async () => { throw new Error('should remain cached'); }, now: () => now });
  await reopened.load(); assert.equal(reopened.getSnapshot().configured, true); assert.equal(await reopened.tick(), 'skipped');
  assert.doesNotMatch(JSON.stringify(h.current()), /synthetic-token/);
});

test('the Android hook uses SecureStore and native streaming fetch; cached data survives foreground/background changes', async () => {
  const React = require('react'); const renderer = require('react-test-renderer'); global.IS_REACT_ACT_ENVIRONMENT = true;
  const keychain = new Map(); const keyWrites = []; const listeners = new Set(); const p = provider();
  let current = null; let connection; const saved = [];
  const AppState = { currentState: 'active', addEventListener(_type, listener) { listeners.add(listener); return { remove() { listeners.delete(listener); } }; } };
  const secure = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7, getItemAsync: async key => keychain.get(key) ?? null,
    setItemAsync: async (key, value, options) => { assert.equal(options.keychainAccessible, 7); keychain.set(key, value); keyWrites.push(key); }, deleteItemAsync: async key => keychain.delete(key) };
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'react-native') return { AppState };
    if (request === 'expo-secure-store') return secure;
    if (request === 'expo/fetch') return { fetch: p.fetch };
    if (request === '@react-native-async-storage/async-storage') throw new Error('Token must not use plaintext preferences');
    return original.call(this, request, parent, isMain);
  };
  let app;
  try {
    const { useMobileMercury } = require('../src/lib/integrations/use-mobile-mercury.ts');
    function Host() { connection = useMobileMercury({ ready: true, current: () => current, save: async value => { current = value; saved.push(value); } }); return React.createElement('status', { configured: connection.state.configured }); }
    await renderer.act(async () => { app = renderer.create(React.createElement(Host)); });
    assert.equal(connection.state.ready, true); assert.equal(connection.state.configured, false); assert.equal(p.calls.length, 0);
    await renderer.act(async () => { await connection.configure('synthetic-token'); await connection.sync(); });
    assert.deepEqual(keyWrites, ['nlc.integrations.mercury.token.v1']); assert.equal(saved.length, 1); assert.equal(connection.state.configured, true);
    assert.doesNotMatch(JSON.stringify(current), /synthetic-token/);
    AppState.currentState = 'background'; await renderer.act(async () => { for (const listener of listeners) listener('background'); });
    AppState.currentState = 'active'; await renderer.act(async () => { for (const listener of listeners) listener('active'); });
    assert.equal(saved.length, 1); await renderer.act(async () => { await connection.disconnect(); });
    assert.equal(keychain.size, 0); assert.equal(current.provider, 'mercury');
    await renderer.act(async () => { app.unmount(); }); app = null; assert.equal(listeners.size, 0);
  } finally { if (app) await renderer.act(async () => app.unmount()); Module._load = original; }
});
