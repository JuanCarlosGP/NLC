const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), Module = require("node:module");
const { test, after } = require("node:test"), { DatabaseSync } = require("node:sqlite"), ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText, file);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nlc-backend-test-"));
let database, adapter; const events = [];
const original = Module._load;
Module._load = function(request, parent, main) {
 if (request === "expo-crypto") return { CryptoDigestAlgorithm: {SHA256:"sha256"}, digestStringAsync: async (_, value) => require("node:crypto").createHash("sha256").update(value).digest("hex") };
 if (request === "@/lib/db/client") return { getDb: async () => adapter, runInTransaction: async (db, fn) => {
  if (require("../src/lib/backend/transaction-scope.ts").inBackendTransaction()) return fn();
  database.exec("BEGIN IMMEDIATE"); try { const result = await fn(); database.exec("COMMIT"); return result; } catch (error) { database.exec("ROLLBACK"); throw error; }
 } };
 if (request === "./native-module" && parent.filename.includes("/backend/")) return { publishWebEvent: event => events.push(event) };
 if (request.startsWith("@/")) request = path.join(__dirname, "../src", request.slice(2));
 return original.call(this, request, parent, main);
};
const { SCHEMA_SQL, BACKEND_TRIGGER_SQL } = require("../src/lib/db/schema.ts");
const { createWeightStore } = require("../src/lib/health/weight/store.ts");
const { expose, exposeStore } = require("../src/lib/backend/registry.ts");
const { executeCommand, enableLocalBackend, withExclusiveRestore } = require("../src/lib/backend/native.ts");
let store = createWeightStore(async () => adapter);
const weights = exposeStore("weight", { list: () => store.list(), save: (...args) => store.save(...args), remove: date => store.remove(date) });
enableLocalBackend();
function open(name) {
 database = new DatabaseSync(path.join(directory, name)); database.exec(SCHEMA_SQL); BACKEND_TRIGGER_SQL.forEach(sql => database.exec(sql));
 adapter = { getFirstAsync: async (sql, ...args) => database.prepare(sql).get(...args) ?? null, getAllAsync: async (sql, ...args) => database.prepare(sql).all(...args), runAsync: async (sql, ...args) => database.prepare(sql).run(...args), execAsync: async sql => database.exec(sql) };
 store = createWeightStore(async () => adapter); events.length = 0;
}
let sequence = 0;
function command(operation, args, expectedVersion = 0, id) { return { protocol: 1, bundleId: "verified-test-bundle", requestId: id || `request_${String(++sequence).padStart(20, "0")}`, operation, args, expectedVersion }; }
const execute = request => executeCommand(request, "verified-test-bundle");
function begin(name) { if (database) database.close(); open(name); }
after(() => { database?.close(); fs.rmSync(directory, { recursive: true, force: true }); Module._load = original; });
test("phone API commits the validated weight, version and retry receipt in the same real SQLite transaction", async () => {
 begin("commit.db"); const request = command("weight.save", [{ entryDate: "2026-11-04", weightKg: "81,4", note: "QA" }]);
 const reply = await execute(request); assert.equal(reply.data.weightKg, 81.4); assert.equal(reply.versions["weight:2026-11-04"], 1);
 assert.equal(database.prepare("SELECT weight_kg FROM health_weight_entries").get().weight_kg, 81.4);
 assert.deepEqual(await execute(request), reply); assert.equal(database.prepare("SELECT COUNT(*) n FROM health_weight_entries").get().n, 1);
 assert.equal(database.prepare("SELECT COUNT(*) n FROM backend_requests").get().n, 1);
 await assert.rejects(execute({ ...request, args: [{ entryDate: "2026-11-04", weightKg: 99 }] }), error => error.status === 409);
});
test("validation failures roll back both the data and the retry receipt", async () => {
 begin("invalid.db"); await assert.rejects(execute(command("weight.save", [{ entryDate: "2026-11-04", weightKg: -1 }])));
 assert.equal(database.prepare("SELECT COUNT(*) n FROM health_weight_entries").get().n, 0); assert.equal(database.prepare("SELECT COUNT(*) n FROM backend_requests").get().n, 0);
});
test("concurrent edits accept one version and preserve the rejected editor's record", async () => {
 begin("concurrent.db"); await execute(command("weight.save", [{ entryDate: "2026-11-04", weightKg: 81 }]));
 const edit = value => execute(command("weight.save", [{ entryDate: "2026-11-04", weightKg: value }, "2026-11-04"], 1));
 const results = await Promise.allSettled([edit(82), edit(83)]);
 assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].reason.status, 409); assert.equal((await store.list())[0].weightKg, 82);
});
test("idempotent retries survive closing and reopening the on-disk catalogue", async () => {
 begin("reopen.db"); const request = command("weight.save", [{ entryDate: "2026-11-04", weightKg: 80 }]); const before = await execute(request);
 database.close(); open("reopen.db"); assert.deepEqual(await execute(request), before); assert.equal((await store.list()).length, 1);
});
test("native facade mutations advance the same record version seen by desktop clients", async () => {
 begin("native.db"); await weights.save({ entryDate: "2026-11-04", weightKg: 80 }); assert.equal(events.at(-1).key, "weight:2026-11-04");
 await assert.rejects(execute(command("weight.save", [{ entryDate: "2026-11-04", weightKg: 81 }, "2026-11-04"], 0)), error => error.status === 409);
 assert.equal((await weights.list())[0].weightKg, 80);
});
test("manual requests cannot access phone-only operations, SQL or an incompatible web bundle", async () => {
 begin("denied.db"); let called = false;
 expose("folders.change", async () => { called = true; }, { domain: "settings", write: true, phoneOnly: true });
 await assert.rejects(execute(command("folders.change", ["file:///tmp/arbitrary"])), error => error.status === 403); assert.equal(called, false);
 await assert.rejects(execute(command("sql.query", ["DELETE FROM tracks"])), error => error.status === 404);
 await assert.rejects(execute({ ...command("weight.list", []), bundleId: "old" }), error => error.status === 426);
 await assert.rejects(execute({ ...command("weight.list", []), requestId: "short" }), error => error.status === 400);
});
test("a local move blocks desktop writes while reads remain available", async () => {
 begin("move.db"); database.prepare("INSERT INTO meta(key,value) VALUES('local_move_active','owned-test')").run();
 await assert.rejects(execute(command("weight.save", [{ entryDate: "2026-11-04", weightKg: 80 }])), error => error.status === 423); assert.deepEqual((await execute(command("weight.list", []))).data, []);
});
test("exclusive restore blocks affected writes without pretending they were saved", async () => {
 begin("restore.db"); let release, entered; const ready = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
 const restore = withExclusiveRestore(async () => { entered(); await gate; }); await ready;
 await assert.rejects(execute(command("weight.save", [{ entryDate: "2026-11-04", weightKg: 80 }])), error => error.status === 423); release(); await restore; assert.equal((await weights.list()).length, 0);
});
const { createMediaSession } = require("../src/lib/player/session-core.ts");
function playerHarness() {
 let fail = false, clock = 1000; const prepared = [], saved = [];
 const session = createMediaSession({ now: () => clock, changed() {}, save: async state => { saved.push(state); }, prepare: async (state, report) => {
  if (fail) throw new Error("unsupported_codec"); const item = { state, paused: false, disposed: false, played: false, object: {}, play: async () => { item.played = true; }, pause: () => { item.paused = true; }, seek: async seconds => { item.position = seconds; }, dispose: () => { item.disposed = true; }, report }; prepared.push(item); return item;
 } });
 return { session, prepared, saved, fail: () => { fail = true; }, advance: () => { clock += 30000; } };
}
const track = { id: "track-1", title: "Fixture", albumId: "album", albumName: "Album", artistId: "artist", artistName: "Artist", durationMs: 120000 };
test("failed transfer to the phone preserves the browser queue, owner and position", async () => {
 const h = playerHarness(); await h.session.play([track], 0, "browser_1234567890123456"); h.session.reportBrowser("browser_1234567890123456", h.session.getSnapshot().revision, 1, 37, 120, true); const previous = h.session.getSnapshot(); h.fail(); await assert.rejects(h.session.toPhone(), /codec/); assert.deepEqual(h.session.getSnapshot(), previous);
});
test("phone playback remains active until a prepared browser confirms the matching transfer", async () => {
 const h = playerHarness(); await h.session.play([track]); h.prepared[0].report(24, 120, true); const lease = h.session.prepareTransfer("browser_1234567890123456", "lease_a_1234567890123456"); assert.equal(h.prepared[0].paused, false);
 await h.session.confirmTransfer("browser_1234567890123456", lease.leaseId); assert.equal(h.prepared[0].paused, true); assert.equal(h.session.getSnapshot().owner, "browser_1234567890123456"); assert.equal(h.session.getSnapshot().currentTime, 24);
});
test("expired or superseded transfer confirmations cannot pause the current destination", async () => {
 const h = playerHarness(); await h.session.play([track]); h.session.prepareTransfer("browser_1234567890123456", "expired_1234567890123456"); h.advance(); await assert.rejects(h.session.confirmTransfer("browser_1234567890123456", "expired_1234567890123456"), /expired/); assert.equal(h.prepared[0].paused, false);
 h.session.prepareTransfer("browser_1234567890123456", "stale_1234567890123456"); await h.session.control("seek", 30); await assert.rejects(h.session.confirmTransfer("browser_1234567890123456", "stale_1234567890123456"), /expired/); assert.equal(h.prepared[0].paused, false);
});
test("playback ignores stale browser reports and reopens a saved queue paused", async () => {
 const h = playerHarness(); const owner = "browser_1234567890123456"; await h.session.play([track], 0, owner); const revision = h.session.getSnapshot().revision;
 assert.equal(h.session.reportBrowser(owner, revision, 2, 42, 120, true), true); assert.equal(h.session.reportBrowser(owner, revision, 1, 12, 120, true), false); assert.equal(h.session.getSnapshot().currentTime, 42);
 h.session.restore(h.saved.at(-1)); assert.equal(h.session.getSnapshot().playing, false); assert.equal(h.session.getSnapshot().queue[0].id, track.id); assert.equal(h.session.getSnapshot().owner, "phone");
});

test("phone clock controls dates and countdowns across time zones and DST", () => {
 const clock = require("../src/lib/backend/clock.ts");
 try {
  const instant = Date.parse("2026-03-29T00:30:00Z"); clock.setPhoneClock(instant, "Europe/Madrid", 1000);
  assert.equal(clock.phoneDateKey(new Date(instant)), "2026-03-29");
  const start = clock.phoneDayStart(instant), next = clock.phoneDayStart(instant, 1); assert.equal(next - start, 23 * 3600000);
  clock.setPhoneClock(instant, "Pacific/Kiritimati", 1000); assert.equal(clock.phoneDateKey(new Date("2026-03-28T12:30:00Z")), "2026-03-29");
  assert.equal(clock.phoneTimeText(new Date(clock.phoneInstant("2026-03-29", "09:15"))), "09:15");
 } finally { clock.resetPhoneClock(); }
});
test("background SQL updates invalidate a desktop editor's original record version", async () => {
 begin("background.db"); const result = await execute(command("weight.save", [{ entryDate: "2026-11-04", weightKg: 80 }]));
 database.prepare("UPDATE health_weight_entries SET weight_kg=82 WHERE entry_date='2026-11-04'").run();
 await assert.rejects(execute(command("weight.save", [{ entryDate: "2026-11-04", weightKg: 81 }, "2026-11-04"], result.versions["weight:2026-11-04"])), error => error.status === 409); assert.equal((await store.list())[0].weightKg, 82);
});

test("a retry keeps its request ID and original version across failed responses and reloads", () => {
 const { createPendingCommands } = require("../src/lib/backend/pending-commands.ts"); const map = new Map(); let sequence = 0; const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
 let pending = createPendingCommands(() => `request_${++sequence}`, storage); const first = pending.begin("tasks.createTask", [{ title: "Fixture" }], { expectedVersion: 3, expectedDomainVersion: 4 });
 assert.equal(pending.begin("tasks.createTask", [{ title: "Fixture" }], { expectedVersion: 99 }).requestId, first.requestId);
 pending = createPendingCommands(() => `request_${++sequence}`, storage); const resumed = pending.begin("tasks.createTask", [{ title: "Fixture" }], { expectedVersion: 99 }); assert.equal(resumed.requestId, first.requestId); assert.equal(resumed.expectedVersion, 3);
 assert.doesNotMatch([...map.values()].join(""), /Fixture/); pending.finish(resumed.key); assert.notEqual(pending.begin("tasks.createTask", [{ title: "Fixture" }], {}).requestId, first.requestId);
});
test("an acknowledgement does not discard edits typed while a save was in flight", () => {
 const draft = require("../src/lib/backend/edit-drafts.ts"); draft.discardEditDraft(); draft.observeVersions({ "weight:inflight": 10 }); draft.markEditDraft("weight"); const sent = draft.editGeneration(); draft.markEditDraft("weight"); draft.observeVersions({ "weight:inflight": 11 }); draft.confirmEdit("weight", sent, { "weight:inflight": 11 }); assert.equal(draft.hasEditDraft(), true); assert.equal(draft.expectedEditVersion("weight", "weight:inflight"), 11); draft.confirmEdit("weight"); assert.equal(draft.hasEditDraft(), false);
});

test("TUI browser preparation leaves the current destination playing until it confirms",async()=>{const h=playerHarness();await h.session.play([track]);const next={...track,id:"track-2"};const lease=h.session.prepareSelection("tui_1234567890123456","lease_1234567890123456",{queue:[next],position:12});assert.equal(h.prepared[0].paused,false);assert.equal(h.session.getSnapshot().queue[0].id,track.id);await h.session.confirmTransfer("tui_1234567890123456",lease.leaseId);assert.equal(h.prepared[0].paused,true);assert.equal(h.session.getSnapshot().queue[0].id,next.id);assert.equal(h.session.getSnapshot().currentTime,12);});
test("secret argument fingerprints cannot enter persistent retry metadata through a later normal write",()=>{const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};const {createPendingCommands}=require("../src/lib/backend/pending-commands.ts");const queue=createPendingCommands(()=>"retry_1234567890123456",storage);queue.begin("credentials.set",["nas","synthetic-secret"],{});queue.begin("weight.save",[{weightKg:74}],{});const stored=[...memory.values()].join("");assert.doesNotMatch(stored,/credentials|synthetic-secret/);});

test("queued background writes survive an unrelated rolled-back command",async()=>{
 begin("background.db"); let enter, release;
 const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
 expose("qa.failure",async()=>{await adapter.runAsync("INSERT INTO meta(key,value) VALUES ('rolled-back','temporary')");enter();await gate;throw new Error("invalid");},{domain:"qa",write:true});
 const failed=execute(command("qa.failure",[])).catch(()=>{});await entered;
 const {serialize}=require("../src/lib/backend/write-queue.ts");let saved=false;
 const background=serialize(async()=>{await adapter.runAsync("INSERT INTO meta(key,value) VALUES ('background','kept')");saved=true;});
 await Promise.resolve();assert.equal(saved,false);release();await failed;await background;
 assert.equal(database.prepare("SELECT value FROM meta WHERE key='rolled-back'").get(),undefined);
 assert.equal(database.prepare("SELECT value FROM meta WHERE key='background'").get().value,"kept");
});
test("media identities remain rebased through repeated imports and database reopening",async()=>{
 begin("remap.db");const {saveMediaRemap,readMediaRemap}=require("../src/lib/player/media-remap.ts");
 await saveMediaRemap(adapter,{old:"first"},{"content://old":"content://first"});
 await saveMediaRemap(adapter,{first:"second"},{"content://first":"content://second"});
 database.close();open("remap.db");const mapping=await readMediaRemap(adapter);
 assert.deepEqual(mapping.ids,{old:"second",first:"second"});assert.equal(mapping.uris["content://old"],"content://second");
});

test("desktop reconnect retries a cold bootstrap and refreshes readers without replaying writes",async()=>{
 const file=require.resolve("../src/lib/backend/remote.ts"),cached=require.cache[file];delete require.cache[file];
 const previous={fetch:global.fetch,window:global.window,document:global.document,EventSource:global.EventSource,setInterval:global.setInterval};
 const previousLoad=Module._load,intervals=[],requests=[];let source,ready=true;
 Module._load=function(request,parent,...args){if(request==="./profile"&&parent.filename===file)return {remoteEnabled:true,PHONE_ONLY:"phone"};return previousLoad.call(this,request,parent,...args);};
 global.window={};global.document={querySelector:()=>({getAttribute:()=>"bundle"})};
 global.setInterval=fn=>{intervals.push(fn);return 1;};
 global.EventSource=class{constructor(){source=this;}};
 global.fetch=async url=>{requests.push(url);return new Response(JSON.stringify({protocol:1,bundleId:"bundle",clock:Date.now(),timeZone:"UTC",preferences:{theme:"classic",locale:"es"}}),{status:ready?200:503});};
 try{
  const remote=require(file);let refreshes=0;remote.onBackendChange(domain=>{if(domain==="*")refreshes++;});
  await remote.bootstrap();assert.equal(remote.remoteState.getSnapshot().connected,true);const initial=refreshes;
  ready=false;source.onerror();source.onopen();await new Promise(resolve=>setImmediate(resolve));assert.equal(remote.remoteState.getSnapshot().connected,false);
  ready=true;intervals[0]();await new Promise(resolve=>setImmediate(resolve));assert.equal(remote.remoteState.getSnapshot().connected,true);assert.ok(refreshes>initial);
  assert.ok(requests.every(url=>url==="/api/v1/bootstrap"));assert.equal(requests.length,3);
 }finally{Module._load=previousLoad;Object.assign(global,previous);delete require.cache[file];if(cached)require.cache[file]=cached;}
});

test("nested transactions never join a different SQLite connection",async()=>{
 const scope=require("../src/lib/backend/transaction-scope.ts"),primary={},isolated={};
 await scope.backendTransaction(async()=>{assert.equal(scope.inBackendTransaction(primary),true);assert.equal(scope.inBackendTransaction(isolated),false);},primary);
 assert.equal(scope.inBackendTransaction(),false);
});
test("a persistence failure during transfer keeps the previous player active",async()=>{
 let fail=false,paused=false;
 const session=createMediaSession({changed(){},save:async()=>{if(fail)throw new Error("storage");},prepare:async()=>({object:{},play(){},pause(){paused=true;},seek(){},dispose(){}})});
 await session.play([track]);const before=session.getSnapshot();const owner="browser_1234567890123456",lease="lease_storage_1234567890";session.prepareTransfer(owner,lease);fail=true;
 await assert.rejects(session.confirmTransfer(owner,lease),/storage/);assert.equal(paused,false);assert.deepEqual(session.getSnapshot(),before);
});

test("restored playback state reaches remote observers after a backend reload",()=>{
 let observed;
 const session=createMediaSession({changed:state=>{observed=state;},save:async()=>{},prepare:async()=>{throw new Error("restoring must not start a player");}});
 session.restore({...session.getSnapshot(),queue:[track],owner:"browser_1234567890123456",playing:true,currentTime:42,revision:6});
 assert.deepEqual(observed,session.getSnapshot());assert.equal(observed.playing,false);assert.equal(observed.owner,"phone");assert.equal(observed.currentTime,42);assert.equal(observed.queue[0].id,track.id);
});
