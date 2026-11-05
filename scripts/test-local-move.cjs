const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  return resolve.call(
    this,
    request.startsWith("@/")
      ? path.join(root, "src", request.slice(2))
      : request,
    parent,
    ...rest,
  );
};
let active;
const load = Module._load;
Module._load = function (request, ...rest) {
  const stubs = {
    "@/lib/db/client": { getDb: async () => active },
    "@/lib/service-backup/preferences": {
      preferenceKey: (key) => "service_preference:" + key,
      servicePreferences: { getItem: async () => null },
    },
    "@/lib/video/browse": {
      seriesFromPath: (path) => ({
        id: "series:" + path.split("/").slice(0, 4).join("/"),
      }),
    },
    "@/lib/video/catalog": {
      encodeVideoPath: (path) => Buffer.from(path).toString("base64url"),
    },
  };
  return Object.hasOwn(stubs, request)
    ? stubs[request]
    : load.call(this, request, ...rest);
};
const { SCHEMA_SQL } = require(root + "/src/lib/db/schema.ts");
const { applyMove } = require(root + "/src/lib/local/move/apply.ts");
const { moveFingerprint, buildMovePlan } = require(
  root + "/src/lib/local/move/plan.ts",
);
const source = {
  sourceKind: "local",
  host: "saved-server",
  localFolderUri: "content://old/music",
  localFolderName: "Old Music",
  videoLocalFolderUri: "content://old/video",
  videoLocalFolderName: "Old Video",
};
const target = {
  ...source,
  localRootFolderUri: "content://general",
  localFolderUri: "content://general/Music",
  videoLocalFolderUri: "content://general/Video",
  healthLocalFolderUri: "content://general/Health",
  focusLocalFolderUri: "content://general/Tasks",
  wealthLocalFolderUri: "content://general/Wealth",
  podcastLocalFolderUri: "content://general/Podcasts",
};
function setup() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(SCHEMA_SQL);
  const db = {
    execAsync: async (q) => sql.exec(q),
    runAsync: async (q, ...p) => sql.prepare(q).run(...p),
    getAllAsync: async (q, ...p) => sql.prepare(q).all(...p),
    getFirstAsync: async (q, ...p) => sql.prepare(q).get(...p) ?? null,
    withTransactionAsync: async (fn) => {
      sql.exec("BEGIN");
      try {
        await fn();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  active = db;
  sql
    .prepare("INSERT INTO meta VALUES (?,?)")
    .run("nas_settings", JSON.stringify(source));
  sql.exec(
    "INSERT INTO artists VALUES ('a','Artist',1,'content://old/cover'); INSERT INTO albums VALUES ('b','Album','a','Artist',2025,'content://old/cover',1,'music'); INSERT INTO tracks (id,title,album_id,album_name,artist_id,artist_name,duration_ms,kind,local_uri,offline_status,cover_id) VALUES ('old-track','Edited song','b','Album','a','Artist',123456,'music','file:///cache/song.mp3','ready','content://old/cover'); INSERT INTO favorites VALUES (0,'old-track'); INSERT INTO recents VALUES (0,'old-track'); INSERT INTO playlists (id,kind,name,owner_name,imported_at,cover_url) VALUES ('p','music','My list','Me',123,'content://old/cover'); INSERT INTO playlist_tracks (playlist_id,position,spotify_id,title,artist_name,album_name,matched_id,cover_url) VALUES ('p',0,'s','Song','Artist','Album','old-track','content://old/cover'); INSERT INTO service_media_origins VALUES ('music','original-id','old-track'); INSERT INTO health_weight_entries VALUES ('2026-11-05',80.2,'Keep',1,2); INSERT INTO prod_projects VALUES ('inbox','Inbox','#fff',1,0); INSERT INTO prod_tasks (id,project_id,title,created_at,updated_at) VALUES ('t','inbox','Keep task',1,2); INSERT INTO wealth_accounts VALUES ('acct','Keep account','cash','EUR',1,0);",
  );
  const job = {
    id: "00000000-0000-4000-8000-000000000001",
    nonce: "proof",
    metadata: { target, fingerprint: moveFingerprint(source) },
  };
  const files = [
    {
      key: "m",
      service: "music",
      source: "file:///cache/song.mp3",
      relative: "Artist/Album/song.mp3",
      uri: "content://general/Music/song.mp3",
      path: "Artist/Album/song (1).mp3",
      bytes: 42,
      refs: ["track:old-track"],
    },
    {
      key: "cover",
      service: "music",
      source: "content://old/cover",
      relative: "cover.jpg",
      uri: "content://general/Music/artwork/cover.jpg",
      path: "artwork/cover.jpg",
      bytes: 3,
      refs: ["uri:content://old/cover"],
    },
  ];
  return { sql, db, job, files };
}
test("atomic move keeps private records, metadata, favorites, recents, playlists and origins", async () => {
  const { sql, db, job, files } = setup();
  let result;
  await db.withTransactionAsync(async () => {
    result = await applyMove(db, job, files, {
      "nlc.track-meta.v2": JSON.stringify({
        "old-track": { artworkUrl: "content://old/cover", durationMs: 900 },
      }),
    });
  });
  const id = "local:content://general/Music/song.mp3";
  assert.equal(result.ids.get("old-track"), id);
  const row = sql.prepare("SELECT * FROM tracks").get();
  assert.equal(row.id, id);
  assert.equal(row.title, "Edited song");
  assert.equal(row.duration_ms, 123456);
  assert.equal(row.local_bytes, 42);
  assert.equal(row.cover_id, "content://general/Music/artwork/cover.jpg");
  for (const [table, col] of [
    ["favorites", "track_id"],
    ["recents", "track_id"],
    ["playlist_tracks", "matched_id"],
    ["service_media_origins", "track_id"],
  ])
    assert.equal(sql.prepare(`SELECT ${col} AS id FROM ${table}`).get().id, id);
  assert.equal(
    sql.prepare("SELECT weight_kg FROM health_weight_entries").get().weight_kg,
    80.2,
  );
  assert.equal(
    sql.prepare("SELECT title FROM prod_tasks").get().title,
    "Keep task",
  );
  assert.equal(
    sql.prepare("SELECT name FROM wealth_accounts").get().name,
    "Keep account",
  );
  const meta = (k) =>
    sql.prepare("SELECT value FROM meta WHERE key=?").get(k)?.value;
  assert.equal(meta("local_move_receipt:" + job.id), "proof");
  assert.equal(JSON.parse(meta("nas_settings")).host, "saved-server");
  assert.equal(
    JSON.parse(meta("nas_settings")).localRootFolderUri,
    "content://general",
  );
  assert.equal(
    JSON.parse(meta("service_preference:nlc.track-meta.v2"))[id].artworkUrl,
    "content://general/Music/artwork/cover.jpg",
  );
});
test("SQL failure rolls paths and receipt back together", async () => {
  const { sql, db, job, files } = setup();
  sql.exec(
    "CREATE TRIGGER qa_fail BEFORE INSERT ON meta WHEN NEW.key LIKE 'local_move_receipt:%' BEGIN SELECT RAISE(ABORT,'disk full'); END",
  );
  await assert.rejects(
    db.withTransactionAsync(() => applyMove(db, job, files, {})),
    /disk full/,
  );
  assert.equal(sql.prepare("SELECT id FROM tracks").get().id, "old-track");
  assert.equal(
    sql
      .prepare("SELECT value FROM meta WHERE key LIKE 'local_move_receipt:%'")
      .get(),
    undefined,
  );
  assert.deepEqual(
    JSON.parse(
      sql.prepare("SELECT value FROM meta WHERE key='nas_settings'").get()
        .value,
    ),
    source,
  );
});
test("a committed job cannot apply its mapping twice after a restart", async () => {
  const { sql, db, job, files } = setup();
  await db.withTransactionAsync(() => applyMove(db, job, files, {}));
  await assert.rejects(
    db.withTransactionAsync(() => applyMove(db, job, files, {})),
    /committed/,
  );
  assert.equal(sql.prepare("SELECT count(*) AS n FROM tracks").get().n, 1);
});
test("changed settings and duplicate destination identities fail before replacing data", async () => {
  const { sql, db, job, files } = setup();
  job.metadata.fingerprint = "old";
  await assert.rejects(
    db.withTransactionAsync(() => applyMove(db, job, files, {})),
    /settingsChanged/,
  );
  job.metadata.fingerprint = moveFingerprint(source);
  sql.exec(
    "INSERT INTO tracks (id,title,album_id,album_name,artist_id,artist_name) VALUES ('local:content://general/Music/song.mp3','Existing','b','Album','a','Artist')",
  );
  await assert.rejects(
    db.withTransactionAsync(() => applyMove(db, job, files, {})),
    /conflict/,
  );
  assert.equal(
    sql.prepare("SELECT title FROM tracks WHERE id='old-track'").get().title,
    "Edited song",
  );
});
test("video normalized names update series paths, likes and playback position", async () => {
  const { sql, db, job, files } = setup();
  const before = "/local-video/series/Show/Season 1/episode.mp4",
    after = "/local-video/series/Show (NLC)/Season 1/episode (1).mp4";
  sql
    .prepare(
      "INSERT INTO tracks (id,title,album_id,album_name,artist_id,artist_name,kind) VALUES (?,'Video','b','Album','a','Artist','video')",
    )
    .run(before);
  files.push({
    key: "v",
    service: "video",
    source: "content://old/video/episode",
    relative: before.slice(13),
    uri: "content://general/Video/episode",
    path: after.slice(13),
    bytes: 3,
    refs: ["track:" + before],
  });
  await db.withTransactionAsync(() =>
    applyMove(db, job, files, {
      "nlc.video.watch.v2": JSON.stringify([
        {
          path: before,
          arcPath: "/local-video/series/Show/Season 1",
          sagaPath: "/local-video/series/Show",
          seriesId: "old",
          positionSec: 111,
          durationSec: 222,
          watchedAt: 123,
        },
      ]),
      "nlc.video.likes.v1": JSON.stringify([
        {
          path: "/local-video/series/Show",
          id: "old",
          title: "Show",
          kind: "series",
        },
      ]),
    }),
  );
  const read = (k) =>
    JSON.parse(
      sql
        .prepare("SELECT value FROM meta WHERE key=?")
        .get("service_preference:" + k).value,
    );
  const watch = read("nlc.video.watch.v2")[0];
  assert.equal(watch.path, after);
  assert.equal(watch.positionSec, 111);
  assert.equal(watch.sagaPath, "/local-video/series/Show (NLC)");
  assert.equal(
    read("nlc.video.likes.v1")[0].path,
    "/local-video/series/Show (NLC)",
  );
});
test("plan includes configured folders and cached media without requesting NAS access", async () => {
  setup();
  const plan = await buildMovePlan(source, target);
  assert.equal(plan.sources.length, 2);
  assert.equal(Object.keys(plan.targets).length, 6);
  assert.equal(
    plan.extras.find((e) => e.ref === "track:old-track").uri,
    "file:///cache/song.mp3",
  );
  assert.ok(plan.extras.some((e) => e.uri === "content://old/cover"));
  assert.deepEqual(source.localFolderUri, "content://old/music");
});
test("same-file URI aliases keep metadata and unknown byte counts", async () => {
  const { sql, db, job, files } = setup();
  files[0].bytes = 0;
  sql.exec("UPDATE tracks SET local_bytes=999");
  await db.withTransactionAsync(() => applyMove(db, job, files, {}));
  assert.equal(
    sql.prepare("SELECT local_bytes FROM tracks").get().local_bytes,
    999,
  );
});

test("only folder settings change if a NAS setting changes during the preview", async () => {
  const { sql, db, job, files } = setup();
  sql
    .prepare("UPDATE meta SET value=? WHERE key='nas_settings'")
    .run(JSON.stringify({ ...source, host: "new-user-configured-host" }));
  await db.withTransactionAsync(() => applyMove(db, job, files, {}));
  assert.equal(
    JSON.parse(
      sql.prepare("SELECT value FROM meta WHERE key='nas_settings'").get()
        .value,
    ).host,
    "new-user-configured-host",
  );
});

test("a failed metadata remap rolls media paths back and writes no receipt", async () => {
  const { sql, db, job, files } = setup();
  await assert.rejects(
    db.withTransactionAsync(() =>
      applyMove(db, job, files, { "nlc.video.watch.v2": "invalid JSON" }),
    ),
  );
  assert.equal(sql.prepare("SELECT id FROM tracks").get().id, "old-track");
  assert.equal(
    sql
      .prepare("SELECT value FROM meta WHERE key LIKE 'local_move_receipt:%'")
      .get(),
    undefined,
  );
});

test("the source barrier waits for previously started mirror work", async () => {
  const {
    withLocalSourceSync,
    drainLocalSourceSync,
    localMoveLocked,
  } = require(root + "/src/lib/local/move-lock.ts");
  const { sql } = setup();
  sql
    .prepare("INSERT INTO meta VALUES (?, ?)")
    .run("local_move_active", "pending-job");
  assert.equal(await localMoveLocked(), true);
  let release;
  const started = withLocalSourceSync(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  let drained = false;
  const barrier = drainLocalSourceSync().then(() => {
    drained = true;
  });
  await Promise.resolve();
  assert.equal(drained, false);
  release();
  await started;
  await barrier;
  assert.equal(drained, true);
});
