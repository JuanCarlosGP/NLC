const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const ts = require('typescript');
require('fake-indexeddb/auto');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText, file);
const { zipSync, strToU8, strFromU8 } = require('fflate');
const m = require('../src/lib/health/backup/model.ts');
const codec = require('../src/lib/health/backup/archive.ts');
const { createHealthBackup } = require('../src/lib/health/backup/core.ts');
const { createNativeBackupAdapter } = require('../src/lib/health/backup/native-adapter.ts');
const { createWebBackupAdapter } = require('../src/lib/health/backup/web-adapter.ts');
const { readSqlHealth, writeSqlHealth } = require('../src/lib/health/backup/sql.ts');
const { createHealthWebDatabase, idbDone, idbResult } = require('../src/lib/health/web-database.ts');
const access = require('../src/lib/health/access.ts');
const { encodeBase64, decodeBase64 } = require('../src/lib/health/backup/base64.ts');
const { newSession, newExercise } = require('../src/lib/health/training/model.ts');
const med = require('../src/lib/health/medication/model.ts');
const { SCHEMA_SQL } = require('../src/lib/db/schema.ts');
const hash = async (bytes) => createHash('sha256').update(bytes).digest('hex');
const now = () => '2026-11-03T12:00:00.000Z';
const exclusive = (task) => task();
let counter = 0; const id = () => `new-${++counter}`;
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'));
function fixture(label = 'original') {
  const session = newSession(label, '2026-11-01'); session.id = `session-${label}`; const exercise = newExercise('Sentadilla'); exercise.sets[0] = { ...exercise.sets[0], weightKg: 60, reps: 8, completed: true }; session.exercises = [exercise]; session.finishedAt = 1;
  const plan = med.newMedicationPlan({ name: `Pauta ${label}`, dose: 'Texto de prueba', kind: 'supplement', note: 'Ficticio', times: ['09:00'], frequency: 'daily', anchorDate: '2026-11-01', endDate: null }, 1, `plan-${label}`);
  const log = med.makeDoseLog({ plans: [plan], logs: [], alertsEnabled: true }, { planId: plan.id, date: '2026-11-02', time: '09:00', status: 'taken', actualTime: '09:15', note: 'Ficticio' }, new Date(2026, 10, 3, 12).getTime());
  const photo = { id: `photo-${label}`, mime: 'image/png', bytes: png.length, width: 1, height: 1 };
  const data = { weights: [{ entryDate: '2026-11-01', weightKg: 80.5, note: label, createdAt: 1, updatedAt: 2 }], sessions: [session], medication: { plans: [plan], logs: [log], alertsEnabled: true }, nutrition: [{ date: '2026-11-01', calories: 2100, protein: 140, carbs: 250, fat: 60, note: label, source: 'manual', foods: [], createdAt: 1, updatedAt: 2 }], bodyReviews: [{ id: `review-${label}`, date: '2026-11-01', note: label, photos: { front: photo }, createdAt: 1, updatedAt: 2 }] };
  return { data, photos: new Map([[photo.id, png]]) };
}
function nativeEnv(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlc-backup-')); const file = path.join(dir, 'db.sqlite'); let db = new DatabaseSync(file); db.exec(SCHEMA_SQL); db.exec('PRAGMA foreign_keys=ON'); let failSql = 0, writes = 0, failPhoto = false, failRecovery = false, failCleanup = false;
  const adapterDb = { async getAllAsync(sql, ...params) { return db.prepare(sql).all(...params); }, async getFirstAsync(sql, ...params) { return db.prepare(sql).get(...params) ?? null; }, async runAsync(sql, ...params) { if (failSql && ++writes === failSql) throw new Error('Disk full'); return db.prepare(sql).run(...params); } };
  const open = async () => adapterDb;
  const transact = async (_, task) => { db.exec('BEGIN'); try { await task(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const photoPath = (photo) => path.join(dir, photo.id + '.photo'); const recoveryPath = (ref) => path.join(dir, ref + '.zip');
  const files = { async read(photo) { return new Uint8Array(await fsp.readFile(photoPath(photo))); }, async write(photo, bytes) { await fsp.writeFile(photoPath(photo), bytes); if (failPhoto) throw new Error('Partial photo'); }, async remove(photo) { if (failCleanup) throw new Error('Cleanup'); await fsp.rm(photoPath(photo), { force: true }); }, async readRecovery(ref) { return new Uint8Array(await fsp.readFile(recoveryPath(ref))); }, async writeRecovery(ref, bytes) { await fsp.writeFile(recoveryPath(ref), bytes); if (failRecovery) throw new Error('Recovery disk full'); }, async removeRecovery(ref) { await fsp.rm(recoveryPath(ref), { force: true }); } };
  const make = () => createNativeBackupAdapter(open, transact, files, id);
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { open, transact, make, photoPath, dir, get db() { return db; }, async seed(snapshot = fixture()) { await transact(adapterDb, () => writeSqlHealth(adapterDb, { data: snapshot.data, rest: { sessionId: snapshot.data.sessions[0].id, exerciseName: 'Sentadilla', endsAt: 9999999999999 } })); for (const photo of m.photoList(snapshot.data)) await files.write(photo, snapshot.photos.get(photo.id)); }, failSql(value) { failSql = value; writes = 0; }, failPhoto(value) { failPhoto = value; }, failRecovery(value) { failRecovery = value; }, failCleanup(value) { failCleanup = value; }, reopen() { db.close(); db = new DatabaseSync(file); db.exec('PRAGMA foreign_keys=ON'); return make(); } };
}
async function webEnv(t, sql) {
  const name = `nlc-backup-test-${++counter}`; const legacyMap = new Map(); const health = createHealthWebDatabase(name, { async getItem(key) { return legacyMap.get(key) ?? null; } }); const db = await health.open();
  const platform = createWebBackupAdapter(health.open, health.storage, sql);
  t.after(() => { db.close(); indexedDB.deleteDatabase(name); });
  return { ...platform, ...health, db, legacyMap, async seed(snapshot = fixture()) { const tx = db.transaction(['reviews','photos'], 'readwrite'); const done = idbDone(tx); for (const review of snapshot.data.bodyReviews) tx.objectStore('reviews').put(review); for (const photo of m.photoList(snapshot.data)) tx.objectStore('photos').put({ id: photo.id, blob: new Blob([snapshot.photos.get(photo.id)], { type: photo.mime }) }); await done;
    if (sql) { const d = await sql.open(); await sql.transact(d, () => writeSqlHealth(d, { data: snapshot.data, rest: null }, false)); }
    else { await health.storage.setItem('nlc.health.weight.v1', JSON.stringify(snapshot.data.weights)); await health.storage.setItem('nlc.health.training.v1', JSON.stringify({ sessions: snapshot.data.sessions, rest: null })); await health.storage.setItem('nlc.health.medication.v1', JSON.stringify(snapshot.data.medication)); await health.storage.setItem('nlc.health.nutrition.v1', JSON.stringify(snapshot.data.nutrition)); }
  } };
}
test('versioned ZIP preserves every module, timestamps and original photo bytes', async () => {
  const original = fixture(); const bytes = await codec.encodeBackup(original, hash, now()); const decoded = await codec.decodeBackup(bytes, hash);
  assert.deepEqual(decoded.data, original.data); assert.deepEqual(decoded.photos.get('photo-original'), png); assert.equal(decoded.createdAt, now()); assert.equal(codec.inspectBackupZip(bytes).size, 2);
});
test('empty Health is a valid complete backup and non-health fields are rejected', async () => {
  const data = { weights: [], sessions: [], medication: { plans: [], logs: [], alertsEnabled: false }, nutrition: [], bodyReviews: [] };
  assert.deepEqual((await codec.decodeBackup(await codec.encodeBackup({ data, photos: new Map() }, hash), hash)).data, data);
  assert.throws(() => m.validateHealthData({ ...data, nasPassword: 'not-allowed' }), { code: 'format' });
});
test('missing, truncated, altered or extra photos abort validation', async () => {
  const sample = fixture(); sample.photos.clear(); await assert.rejects(codec.encodeBackup(sample, hash), { code: 'missingPhoto' });
  const bytes = await codec.encodeBackup(fixture(), hash); const image = codec.inspectBackupZip(bytes).get('photos/photo-original.png'); const corrupt = bytes.slice(); corrupt[image.start + 20] ^= 1;
  await assert.rejects(codec.decodeBackup(corrupt, hash), { code: 'integrity' }); await assert.rejects(codec.decodeBackup(bytes.slice(0, -10), hash));
});
async function editManifest(change) { const bytes = await codec.encodeBackup(fixture(), hash); const entries = codec.inspectBackupZip(bytes); const files = {}; for (const [name, item] of entries) files[name] = [bytes.slice(item.start, item.start + item.size), { level: 0 }]; const manifest = JSON.parse(strFromU8(files['manifest.json'][0])); change(manifest, files); files['manifest.json'] = [strToU8(JSON.stringify(manifest)), { level: 0 }]; return zipSync(files); }
test('unsupported versions, invalid relationships and changed metadata are rejected', async () => {
  await assert.rejects(codec.decodeBackup(await editManifest((m) => m.version = 99), hash), { code: 'version' });
  await assert.rejects(codec.decodeBackup(await editManifest((m) => m.data.weights[0].weightKg = 81), hash), { code: 'integrity' });
  await assert.rejects(codec.decodeBackup(await editManifest((m) => m.data.medication.plans = []), hash), { code: 'format' });
  await assert.rejects(codec.decodeBackup(await editManifest((m) => m.data.sessions.push(m.data.sessions[0])), hash), { code: 'format' });
  await assert.rejects(codec.decodeBackup(await editManifest((m, files) => files['photos/extra.png'] = [png, { level: 0 }]), hash), { code: 'integrity' });
});
test('ZIP traversal, duplicate names, compressed entries and oversized advertised data are rejected before extraction', async () => {
  const traversal = zipSync({ '../outside': [strToU8('bad'), { level: 0 }] }); assert.throws(() => codec.inspectBackupZip(traversal), { code: 'format' });
  const compressed = zipSync({ 'manifest.json': [strToU8('a'.repeat(300)), { level: 6 }] }); assert.throws(() => codec.inspectBackupZip(compressed), { code: 'format' });
  const bytes = await codec.encodeBackup(fixture(), hash); const corrupt = bytes.slice(); const view = new DataView(corrupt.buffer); let central = -1; for (let i=0;i<bytes.length-4;i++) if (view.getUint32(i,true)===0x02014b50) { central=i; break; } view.setUint32(central+24, m.MAX_BACKUP_BYTES+1,true); assert.throws(() => codec.inspectBackupZip(corrupt), { code: 'size' });
  const duplicate = bytes.slice(); const v = new DataView(duplicate.buffer); const end = duplicate.length-22; v.setUint16(end+10, 65535, true); assert.throws(() => codec.inspectBackupZip(duplicate), { code: 'size' });
});
test('native restore replaces Health atomically, preserves unrelated rows and keeps a durable previous ZIP', async (t) => {
  const e = nativeEnv(t); await e.seed(); e.db.exec("INSERT INTO meta VALUES ('unrelated','keep'); INSERT INTO favorites VALUES (0,'song')");
  const service = createHealthBackup(e.make(), hash, exclusive, id, now); const archive = await codec.encodeBackup(fixture('incoming'), hash);
  await service.restore(archive); const current = await e.make().read(); assert.equal(current.data.weights[0].note, 'incoming'); assert.equal(current.data.medication.alertsEnabled, false); assert.notEqual(current.data.bodyReviews[0].photos.front.id, 'photo-incoming'); assert.deepEqual([...current.photos.values()][0], png);
  assert.equal((await readSqlHealth(await e.open())).rest, null); assert.equal(e.db.prepare("SELECT value FROM meta WHERE key='unrelated'").get().value, 'keep'); assert.equal(e.db.prepare('SELECT track_id FROM favorites').get().track_id, 'song');
  const reopened = createHealthBackup(e.reopen(), hash, exclusive, id, now); assert.equal((await reopened.recoveryInfo()).weights, 1); const previous = await codec.decodeBackup(await reopened.recoveryBytes(), hash); assert.equal(previous.data.weights[0].note, 'original');
});
test('restoring the recovery copy can undo and redo a complete restore', async (t) => {
  const e = nativeEnv(t); await e.seed(); const service = createHealthBackup(e.make(), hash, exclusive, id, now); await service.restore(await codec.encodeBackup(fixture('incoming'), hash));
  await service.restore(await service.recoveryBytes()); assert.equal((await e.make().read()).data.weights[0].note, 'original');
  const redo = await service.recoveryBytes(); assert.equal((await codec.decodeBackup(redo, hash)).data.weights[0].note, 'incoming'); await service.restore(redo); assert.equal((await e.make().read()).data.weights[0].note, 'incoming');
});
test('SQLite mid-restore failure rolls back all modules, timer and previous recovery reference', async (t) => {
  const e = nativeEnv(t); await e.seed(); const before = await e.make().read(); const rest = (await readSqlHealth(await e.open())).rest; const service = createHealthBackup(e.make(), hash, exclusive, id, now);
  e.failSql(12); await assert.rejects(service.restore(await codec.encodeBackup(fixture('incoming'), hash))); assert.deepEqual(await e.make().read(), before); assert.deepEqual((await readSqlHealth(await e.open())).rest, rest); assert.equal(await service.recoveryInfo(), null); assert.equal(fs.readdirSync(e.dir).filter((file) => file.endsWith('.zip')).length, 0);
  e.failSql(0); await service.restore(await codec.encodeBackup(fixture('incoming'), hash)); assert.equal((await e.make().read()).data.weights[0].note, 'incoming');
});
test('partial photo or recovery-file writes leave the previous Health untouched', async (t) => {
  const e = nativeEnv(t); await e.seed(); const before = await e.make().read(); const service = createHealthBackup(e.make(), hash, exclusive, id, now); const bytes = await codec.encodeBackup(fixture('incoming'), hash);
  e.failPhoto(true); await assert.rejects(service.restore(bytes)); assert.deepEqual(await e.make().read(), before); assert.equal(fs.readdirSync(e.dir).filter((name)=>name.endsWith('.photo')).length, 1);
  e.failPhoto(false); e.failRecovery(true); await assert.rejects(service.restore(bytes)); assert.deepEqual(await e.make().read(), before); assert.equal(fs.readdirSync(e.dir).filter((name)=>name.endsWith('.zip')).length, 0);
});
test('cleanup failure after commit retains restored data and its recovery archive', async (t) => {
  const e = nativeEnv(t); await e.seed(); e.failCleanup(true); const service = createHealthBackup(e.make(), hash, exclusive, id, now); await service.restore(await codec.encodeBackup(fixture('incoming'), hash)); assert.equal((await e.make().read()).data.weights[0].note, 'incoming'); assert.equal((await codec.decodeBackup(await service.recoveryBytes(), hash)).data.weights[0].note, 'original');
});
test('confirmation revalidates the archive and repeated restoration never duplicates rows', async (t) => {
  const e = nativeEnv(t); await e.seed(); const service = createHealthBackup(e.make(), hash, exclusive, id, now); const bytes = await codec.encodeBackup(fixture('incoming'), hash); await service.inspect(bytes); const bad = bytes.slice(); bad[0] ^= 1; await assert.rejects(service.restore(bad)); assert.equal((await e.make().read()).data.weights[0].note, 'original');
  await service.restore(bytes); await service.restore(bytes); assert.equal((await e.make().read()).data.sessions.length, 1); assert.equal((await e.make().read()).data.bodyReviews.length, 1);
});
test('normal web migrates AsyncStorage values once and restores all records/photos in one IDB transaction', async (t) => {
  const e = await webEnv(t); e.legacyMap.set('nlc.health.weight.v1', JSON.stringify(fixture().data.weights)); assert.equal(JSON.parse(await e.storage.getItem('nlc.health.weight.v1'))[0].note, 'original'); e.legacyMap.set('nlc.health.weight.v1', 'changed'); assert.equal(JSON.parse(await e.storage.getItem('nlc.health.weight.v1'))[0].note, 'original');
  await e.seed(); const service = createHealthBackup(e.adapter, hash, exclusive, id, now); await service.restore(await codec.encodeBackup(fixture('incoming'), hash)); const current = await e.adapter.read(); assert.equal(current.data.weights[0].note, 'incoming'); assert.equal(current.data.bodyReviews[0].note, 'incoming'); assert.deepEqual([...current.photos.values()][0], png); assert.equal((await codec.decodeBackup(await service.recoveryBytes(), hash)).data.weights[0].note, 'original');
});
test('upgrading the photo database from version 1 preserves reviews and image blobs', async (t) => {
  const name = `nlc-old-body-${++counter}`; const request = indexedDB.open(name,1); request.onupgradeneeded=()=>{request.result.createObjectStore('reviews',{keyPath:'id'}).createIndex('date','date',{unique:true});request.result.createObjectStore('photos',{keyPath:'id'});}; const old=await idbResult(request); const tx=old.transaction(['reviews','photos'],'readwrite'); const done=idbDone(tx); tx.objectStore('reviews').put(fixture().data.bodyReviews[0]); tx.objectStore('photos').put({id:'photo-original',blob:new Blob([png])}); await done; old.close();
  const health=createHealthWebDatabase(name,{async getItem(){return null;}}); const db=await health.open(); t.after(()=>{db.close();indexedDB.deleteDatabase(name);}); assert.equal((await idbResult(db.transaction('reviews').objectStore('reviews').getAll())).length,1); assert.equal((await idbResult(db.transaction('photos').objectStore('photos').get('photo-original'))).blob.size,png.length); assert.ok(db.objectStoreNames.contains('health-values'));
});
test('web IDB abort preserves all previous records and photos', async (t) => {
  const e = await webEnv(t); await e.seed(); const target = await codec.decodeBackup(await codec.encodeBackup(fixture('incoming'),hash),hash); const db = e.db; const transaction = db.transaction.bind(db);
  db.transaction = (...args) => { const tx=transaction(...args); if (args[1]==='readwrite' && Array.isArray(args[0]) && args[0].includes('health-values')) { const store=tx.objectStore('photos'); const put=store.put.bind(store); store.put=(...a)=>{const result=put(...a);tx.abort();return result;}; } return tx; };
  await assert.rejects(e.adapter.apply(target, new Uint8Array([1]), m.backupInfo(fixture().data,now(),1))); db.transaction=transaction;
  assert.equal((await e.adapter.read()).data.weights[0].note,'original'); assert.equal((await e.adapter.read()).data.bodyReviews[0].note,'original'); assert.equal(await e.adapter.recoveryInfo(),null);
});
test('demo web recovery rolls back interrupted SQLite changes before reads resume', async (t) => {
  const n=nativeEnv(t); const sql={open:n.open,transact:n.transact}; const e=await webEnv(t,sql); await e.seed(); const previous=await readSqlHealth(await n.open(),false);
  const tx=e.db.transaction('maintenance','readwrite'); const done=idbDone(tx); tx.objectStore('maintenance').put({key:'pending',previous}); await done;
  const db=await n.open(); await n.transact(db,()=>writeSqlHealth(db,{data:fixture('incoming').data,rest:null},false));
  const fresh=createWebBackupAdapter(e.open,e.storage,sql); await fresh.recover(); assert.equal((await fresh.adapter.read()).data.weights[0].note,'original'); assert.equal(await idbResult(e.db.transaction('maintenance').objectStore('maintenance').get('pending')),undefined);
});
test('demo cross-store failure rolls back SQL and keeps the former photos', async (t) => {
  const n=nativeEnv(t); const e=await webEnv(t,{open:n.open,transact:n.transact}); await e.seed(); const service=createHealthBackup(e.adapter,hash,exclusive,id,now); const transaction=e.db.transaction.bind(e.db);
  e.db.transaction=(...args)=>{const tx=transaction(...args);if(args[1]==='readwrite'&&Array.isArray(args[0])&&args[0].includes('photos')){const reviews=tx.objectStore('reviews');reviews.put=()=>{throw new Error('Quota');};}return tx;};
  await assert.rejects(service.restore(await codec.encodeBackup(fixture('incoming'),hash))); e.db.transaction=transaction;
  assert.equal((await e.adapter.read()).data.weights[0].note,'original'); assert.equal((await e.adapter.read()).data.bodyReviews[0].note,'original'); assert.equal(await e.adapter.recoveryInfo(),null);
});
test('health barrier drains writes and prevents readers seeing an in-flight restore', async () => {
  const events=[]; access.registerHealthRecovery(async()=>events.push('recover')); let release; const gate=new Promise(resolve=>release=resolve);
  const store=access.coordinatedHealthStore({async save(){events.push('save');await gate;events.push('saved');},async list(){events.push('list');return[];}});
  const saving=store.save(); const restoring=access.withHealthLock(async()=>events.push('restore')); const reading=store.list(); await Promise.resolve(); await Promise.resolve(); assert.deepEqual(events,['recover','save']); release(); await Promise.all([saving,restoring,reading]); assert.deepEqual(events,['recover','save','saved','recover','restore','recover','list']); access.registerHealthRecovery(async()=>{});
});
test('base64 file transport is exact for binary input and rejects malformed content', () => {
  for(const size of [0,1,2,3,256,15000]){const bytes=Uint8Array.from({length:size},(_,i)=>i%256);assert.equal(encodeBase64(bytes),Buffer.from(bytes).toString('base64'));assert.deepEqual(decodeBase64(encodeBase64(bytes)),bytes);}assert.throws(()=>decodeBase64('bad'));
});

test('a failed later restore retains both current Health and the existing recovery ZIP', async (t) => {
  const e=nativeEnv(t);await e.seed();const service=createHealthBackup(e.make(),hash,exclusive,id,now);
  await service.restore(await codec.encodeBackup(fixture('incoming'),hash)); const before=await e.make().read();const recovery=await service.recoveryBytes();
  e.failSql(12);await assert.rejects(service.restore(await codec.encodeBackup(fixture('other'),hash))); e.failSql(0);
  assert.deepEqual(await e.make().read(),before);assert.deepEqual(await service.recoveryBytes(),recovery);assert.equal(fs.readdirSync(e.dir).filter(name=>name.endsWith('.zip')).length,1);
});
test('an interrupted demo restore stays recoverable when the first SQL recovery attempt fails', async (t) => {
  const n=nativeEnv(t);const e=await webEnv(t,{open:n.open,transact:n.transact});await e.seed();const before=await readSqlHealth(await n.open(),false);
  const tx=e.db.transaction('maintenance','readwrite');const done=idbDone(tx);tx.objectStore('maintenance').put({key:'pending',previous:before});await done;
  const db=await n.open();await n.transact(db,()=>writeSqlHealth(db,{data:fixture('incoming').data,rest:null},false));
  const next=createWebBackupAdapter(e.open,e.storage,{open:n.open,transact:n.transact});n.failSql(1);await assert.rejects(next.recover());assert.ok(await idbResult(e.db.transaction('maintenance').objectStore('maintenance').get('pending')));
  n.failSql(0);await next.recover();assert.equal((await next.adapter.read()).data.weights[0].note,'original');
});

const { readBinaryChunks, BINARY_READ_CHUNK_BYTES } = require('../src/lib/health/backup/native-files.ts');
function diskBinaryHandle(file, track) {
  const fd = fs.openSync(file, 'r'); let offset = 0;
  return {
    get offset() { return offset; },
    readBytes(length) {
      track.requests.push(length);
      // Non-zero byte offsets exercise the bridge's typed-array views.
      const buffer = Buffer.alloc(length + 8);
      const read = fs.readSync(fd, buffer, 4, length, offset);
      offset += read;
      return buffer.subarray(4, 4 + read);
    },
    close() { fs.closeSync(fd); track.closed++; },
  };
}
test('Android binary transport preserves a real multi-chunk file without whole-file text conversion', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlc-binary-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'input.zip'); const input = Buffer.alloc(2 * BINARY_READ_CHUNK_BYTES + 71);
  for (let i = 0; i < input.length; i++) input[i] = (i * 31 + 7) & 255;
  fs.writeFileSync(file, input); const track = { requests: [], closed: 0 };
  const bytes = await readBinaryChunks(input.length, m.MAX_BACKUP_BYTES, () => diskBinaryHandle(file, track));
  assert.ok(Buffer.from(bytes).equals(input)); assert.equal(track.closed, 1);
  assert.ok(Math.max(...track.requests) <= BINARY_READ_CHUNK_BYTES);
});
test('Android binary transport rejects oversized files before opening or allocating their payload', async () => {
  let opened = false;
  await assert.rejects(readBinaryChunks(m.MAX_BACKUP_BYTES + 1, m.MAX_BACKUP_BYTES, () => { opened = true; throw new Error('Must not open'); }), { code: 'size' });
  assert.equal(opened, false);
});
test('Android binary transport rejects truncated or grown files and closes handles after read failures', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlc-binary-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'changed.zip'); fs.writeFileSync(file, Buffer.from([1, 2, 3]));
  for (const declared of [2, 4]) {
    const track = { requests: [], closed: 0 };
    await assert.rejects(readBinaryChunks(declared, 10, () => diskBinaryHandle(file, track)), { code: 'integrity' });
    assert.equal(track.closed, 1);
  }
  let closed = 0;
  await assert.rejects(readBinaryChunks(1, 10, () => ({ offset: 0, readBytes() { throw new Error('Read failed'); }, close() { closed++; } })), /Read failed/);
  assert.equal(closed, 1);
});
