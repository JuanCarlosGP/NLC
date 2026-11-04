const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file,
}).outputText, file);
const m = require('../src/lib/health/body-photos/model.ts');
const { createBodyStore } = require('../src/lib/health/body-photos/store.ts');
const { createFileBodyPersistence } = require('../src/lib/health/body-photos/file-persistence.ts');
const { SCHEMA_SQL } = require('../src/lib/db/schema.ts');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const timestamp = new Date(2026, 10, 3, 12).getTime();
function environment(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlc-body-')); const file = path.join(dir, 'db.sqlite');
  const originals = path.join(dir, 'original.png'); fs.writeFileSync(originals, png);
  const privateDir = path.join(dir, 'private'); fs.mkdirSync(privateDir);
  let db = new DatabaseSync(file); db.exec(SCHEMA_SQL); let failWrite = false; let failCopy = false; let failRemove = false;
  const photoPath = (photo) => path.join(privateDir, `${photo.id}.${m.photoExtension(photo.mime)}`);
  const adapter = {
    async getAllAsync(sql, ...params) { return db.prepare(sql).all(...params); },
    async runAsync(sql, ...params) { if (failWrite) throw new Error('Disk full'); return db.prepare(sql).run(...params); },
  };
  const files = {
    async copy(photo, input) { await fsp.copyFile(input.source, photoPath(photo)); if (failCopy) throw new Error('Partial copy failure'); },
    async remove(photo) { if (failRemove) throw new Error('Cleanup failed'); await fsp.rm(photoPath(photo), { force: true }); },
    async source(photo) { await fsp.access(photoPath(photo)); return { uri: photoPath(photo), dispose() {} }; },
  };
  const makeStore = () => createBodyStore(createFileBodyPersistence(async () => adapter, files), () => timestamp);
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { makeStore, photoPath, privateDir, originals, input: { mime: 'image/png', bytes: png.length, width: 1, height: 1, source: originals },
    get db() { return db; }, failWrite(value) { failWrite = value; }, failCopy(value) { failCopy = value; }, failRemove(value) { failRemove = value; },
    reopen() { db.close(); db = new DatabaseSync(file); return makeStore(); } };
}
test('photo formats are identified by bytes, with file and pixel limits', () => {
  assert.equal(m.detectPhotoMime(png), 'image/png');
  assert.equal(m.detectPhotoMime(Uint8Array.from([255,216,255,224])), 'image/jpeg');
  assert.equal(m.detectPhotoMime(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.throws(() => m.detectPhotoMime(Buffer.from('<svg>')), { code: 'type' });
  const photo = { mime: 'image/png', bytes: png.length, width: 1, height: 1 };
  assert.doesNotThrow(() => m.validatePhoto(photo));
  assert.throws(() => m.validatePhoto({ ...photo, bytes: 0 }), { code: 'size' });
  assert.throws(() => m.validatePhoto({ ...photo, bytes: m.MAX_PHOTO_BYTES + 1 }), { code: 'size' });
  assert.throws(() => m.validatePhoto({ ...photo, width: 7000, height: 7000 }), { code: 'dimensions' });
  assert.throws(() => m.validatePhoto({ ...photo, mime: 'image/svg+xml' }), { code: 'type' });
});
test('dates and notes are validated without depending on timestamps or DST', () => {
  assert.deepEqual(m.normalizeBodyInput('2024-02-29', '  note  ', '2026-11-03'), { date: '2024-02-29', note: 'note' });
  assert.throws(() => m.normalizeBodyInput('2026-02-29', '', '2026-11-03'), { code: 'date' });
  assert.throws(() => m.normalizeBodyInput('2026-11-04', '', '2026-11-03'), { code: 'future' });
  assert.throws(() => m.normalizeBodyInput('2026-11-03', 'x'.repeat(2001), '2026-11-03'), { code: 'note' });
});
test('one review per date; changing dates is atomic and preserves identity and photos', async (t) => {
  const env = environment(t); const store = env.makeStore();
  let entries = await store.save('2026-10-01', 'First'); const first = entries[0];
  await store.setPhoto(first.id, 'front', env.input); entries = await store.save('2026-10-02', 'Second');
  await assert.rejects(store.save('2026-10-01', 'Duplicate'), { code: 'conflict' });
  await assert.rejects(store.save('2026-10-02', 'Move', first.id), { code: 'conflict' });
  assert.equal((await store.list()).length, 2);
  entries = await store.save('2026-09-30', 'Moved', first.id);
  const moved = entries.find((entry) => entry.id === first.id);
  assert.equal(moved.createdAt, first.createdAt); assert.equal(moved.note, 'Moved'); assert.ok(moved.photos.front);
  assert.equal(entries.at(-1).date, '2026-09-30');
});
test('private photo bytes and metadata survive reopening and loss of the selected original', async (t) => {
  const env = environment(t); let store = env.makeStore(); const entry = (await store.save('2026-11-01', 'Keep'))[0];
  await store.setPhoto(entry.id, 'front', env.input); await fsp.rm(env.originals);
  store = env.reopen(); const reopened = (await store.list())[0];
  assert.equal(m.bodyPhotoCount(reopened), 1); const source = await store.source(reopened.photos.front);
  assert.deepEqual(await fsp.readFile(source.uri), png); assert.equal(reopened.note, 'Keep');
});
test('failed metadata commit rolls back the new copy while preserving the previous photo', async (t) => {
  const env = environment(t); const store = env.makeStore(); const entry = (await store.save('2026-11-01', ''))[0];
  const saved = (await store.setPhoto(entry.id, 'front', env.input))[0]; const previous = saved.photos.front;
  env.failWrite(true); await assert.rejects(store.setPhoto(entry.id, 'front', env.input)); env.failWrite(false);
  assert.equal((await store.list())[0].photos.front.id, previous.id);
  assert.deepEqual(fs.readdirSync(env.privateDir), [path.basename(env.photoPath(previous))]);
  assert.deepEqual(await fsp.readFile(env.photoPath(previous)), png);
});
test('partial copy failures clean up unreferenced files and allow a retry', async (t) => {
  const env = environment(t); const store = env.makeStore(); const entry = (await store.save('2026-11-01', ''))[0];
  env.failCopy(true); await assert.rejects(store.setPhoto(entry.id, 'left', env.input));
  assert.equal(m.bodyPhotoCount((await store.list())[0]), 0); assert.equal(fs.readdirSync(env.privateDir).length, 0);
  env.failCopy(false); await store.setPhoto(entry.id, 'left', env.input); assert.equal(m.bodyPhotoCount((await store.list())[0]), 1);
});
test('queued edits keep all poses; replacing or removing one leaves the others intact', async (t) => {
  const env = environment(t); const store = env.makeStore(); const entry = (await store.save('2026-11-01', ''))[0];
  await Promise.all(m.BODY_POSES.map((pose) => store.setPhoto(entry.id, pose, env.input)));
  let saved = (await store.list())[0]; assert.equal(m.bodyPhotoCount(saved), 4); const previous = saved.photos.front; const back = saved.photos.back;
  saved = (await store.setPhoto(entry.id, 'front', env.input))[0];
  assert.notEqual(saved.photos.front.id, previous.id); assert.equal(saved.photos.back.id, back.id); assert.equal(fs.existsSync(env.photoPath(previous)), false);
  saved = (await store.setPhoto(entry.id, 'left', null))[0]; assert.equal(m.bodyPhotoCount(saved), 3); assert.equal(saved.photos.back.id, back.id);
  await store.remove(entry.id); assert.equal((await store.list()).length, 0); assert.equal(fs.readdirSync(env.privateDir).length, 0);
});
test('failed deletion preserves referenced photos and the review', async (t) => {
  const env = environment(t); const store = env.makeStore(); const entry = (await store.save('2026-11-01', ''))[0];
  const saved = (await store.setPhoto(entry.id, 'front', env.input))[0];
  env.failWrite(true); await assert.rejects(store.remove(entry.id)); env.failWrite(false);
  assert.equal((await store.list()).length, 1); assert.equal(fs.existsSync(env.photoPath(saved.photos.front)), true);
});
test('cleanup failure after commit does not report the valid new photo as unsaved', async (t) => {
  const env = environment(t); const store = env.makeStore(); const entry = (await store.save('2026-11-01', ''))[0];
  await store.setPhoto(entry.id, 'front', env.input); env.failRemove(true);
  const saved = (await store.setPhoto(entry.id, 'front', env.input))[0]; assert.ok(saved.photos.front); assert.equal((await store.list())[0].photos.front.id, saved.photos.front.id);
});
test('comparison chooses two dated records with photos and handles missing views', () => {
  const photo = { id: 'photo', mime: 'image/png', bytes: png.length, width: 1, height: 1 };
  const entry = (id, date, photos = {}) => ({ id, date, note: '', photos, createdAt: 1, updatedAt: 1 });
  const entries = [entry('draft','2026-11-03'), entry('b','2026-11-01',{ front: photo }), entry('a','2026-10-01',{ back: { ...photo,id:'back' } })];
  assert.deepEqual(m.comparisonPair(entries), ['a','b']); assert.deepEqual(m.comparisonPair(entries, 'a'), ['a','b']);
  assert.deepEqual(m.comparisonPair([entries[1]]), [null,'b']); assert.deepEqual(m.comparisonPair([]), [null,null]);
  assert.equal(entries[2].photos.front, undefined);
});
test('corrupt metadata or reused photo identifiers block writes without overwriting data', async (t) => {
  const env = environment(t); const store = env.makeStore(); const first = (await store.save('2026-11-01', ''))[0];
  const withPhoto = (await store.setPhoto(first.id, 'front', env.input))[0];
  const second = (await store.save('2026-11-02', '')).find((entry) => entry.id !== first.id);
  env.db.prepare('UPDATE health_body_reviews SET payload=? WHERE id=?').run(JSON.stringify({ ...second, photos: withPhoto.photos }), second.id);
  await assert.rejects(store.list(), { code: 'invalid' }); await assert.rejects(store.save('2026-10-01', 'Do not replace'));
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM health_body_reviews').get().n, 2);
});
test('schema v10 adds photos without changing medication, training, weight or favorites', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/catalog-v9.sql'), 'utf8'));
    db.exec("INSERT INTO meta VALUES ('schema','9'); INSERT INTO favorites VALUES (0,'track'); INSERT INTO health_weight_entries VALUES ('2026-11-01',70,'keep',1,1)");
    db.prepare('INSERT INTO health_training_sessions VALUES (?,?,?,?)').run('training', '2026-11-01', 1, 'keep');
    db.prepare('INSERT INTO health_medication_plans VALUES (?,?,?)').run('medication', 1, 'keep');
    db.exec(SCHEMA_SQL); db.exec(SCHEMA_SQL);
    assert.equal(db.prepare('SELECT track_id FROM favorites').get().track_id, 'track');
    assert.equal(db.prepare('SELECT weight_kg FROM health_weight_entries').get().weight_kg, 70);
    assert.equal(db.prepare('SELECT id FROM health_training_sessions').get().id, 'training');
    assert.equal(db.prepare('SELECT id FROM health_medication_plans').get().id, 'medication');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM health_body_reviews').get().n, 0);
  } finally { db.close(); }
});
