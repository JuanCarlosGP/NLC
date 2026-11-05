const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: file,
    }).outputText,
    file,
  );
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith("@/"))
    request = path.join(root, "src", request.slice(2));
  return resolve.call(this, request, parent, ...rest);
};
let active,
  sqlite,
  failSql = "",
  sourceCalls = 0,
  davTransport = null,
  davEntries = [],
  folderFiles = [],
  commits = 0;
const memory = new Map();
const copied = [];
const originalLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request.startsWith(".") && parent?.filename) {
    const absolute = path.resolve(path.dirname(parent.filename), request);
    if (absolute === root + "/src/lib/service-backup/native")
      request = "@/lib/service-backup/native";
  }
  const stubs = {
    "@/lib/backend/native-module": { publishWebEvent() {} },
    "@/lib/settings/secret-store": {
      getSecret: async () => null,
      setSecret: async () => {},
      deleteSecret: async () => {},
    },
    "react-native": { Platform: { OS: "android", select: (o) => o.default } },
    "expo-crypto": crypto,
    "@react-native-async-storage/async-storage": {
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, v) => memory.set(key, v),
      removeItem: async (key) => memory.delete(key),
    },
    "expo-file-system/legacy": {
      documentDirectory: "file:///app/",
      getInfoAsync: async (uri) => ({
        exists: true,
        isDirectory: false,
        size: 3,
      }),
      makeDirectoryAsync: async () => {},
      copyAsync: async (v) => copied.push(v),
      deleteAsync: async () => {},
    },
    "@/lib/db/client": {
      getDb: async () => active,
      runInTransaction: (db, task) => db.withTransactionAsync(task),
    },
    "@/lib/db/sqlite-client": { openIsolatedHealthDb: async () => active },
    "@/lib/nas/source-factory": {
      createMusicSource: () => ({
        getAlbums: async () => {
          sourceCalls++;
        },
      }),
    },
    "@/lib/nas/webdav-source": {
      createDavTransport: () => {
        if (davTransport) return davTransport;
        throw new Error("NAS contacted in local mode");
      },
      listWebDavDir: async () => {
        if (davTransport) return davEntries;
        throw new Error("NAS contacted in local mode");
      },
    },
    "@/lib/service-backup/native": {
      finishArchiveCommit: async () => {},
      listArchiveFolder: async () => folderFiles,
      commitArchiveFiles: async (stage) => {
        commits++;
        return {
          root: "content://new-root",
          name: "NLC-import",
          paths: Object.fromEntries(Object.keys(stage.files).map(p => [p, p.slice(6)])),
          files: Object.fromEntries(
            Object.entries(stage.files).map(([p]) => [
              p,
              `content://new-root/${p.slice(6)}`,
            ]),
          ),
        };
      },
    },
    "@/lib/service-backup/events": { notifyServiceImport() {} },
    "@/lib/db/catalog": { notifyCatalog() {} },
  };
  if (/\.(internal|impl)$/.test(request) && Object.hasOwn(stubs, request.replace(/\.(internal|impl)$/, ""))) request = request.replace(/\.(internal|impl)$/, "");
  if (Object.hasOwn(stubs, request)) return stubs[request];
  return originalLoad.call(this, request, parent, ...rest);
};
const { SCHEMA_SQL } = require(root + "/src/lib/db/schema.ts");
const {
  TABLES,
  validateServiceArchive,
  validArchivePath,
  archiveSummary,
} = require(root + "/src/lib/service-backup/model.ts");
const { sourceMode, phoneOnly, withLocalFolder, withSourceMode } = require(
  root + "/src/lib/settings/service-source.ts",
);
const { createArchivePlan } = require(root + "/src/lib/service-backup/plan.ts");
const { restoreService } = require(root + "/src/lib/service-backup/restore.ts");
const settings = {
  sourceKind: "webdav",
  host: "",
  port: "5005",
  username: "",
  sharePath: "",
  useHttps: false,
  maxBitRate: "0",
  localFolderUri: "",
  localFolderName: "",
  podcastSharePath: "",
  podcastLocalFolderUri: "",
  podcastLocalFolderName: "",
  videoHost: "",
  videoPort: "5005",
  videoUsername: "",
  videoSharePath: "",
  videoUseHttps: false,
  videoLocalFolderUri: "",
  videoLocalFolderName: "",
  wealthSharePath: "",
  wealthLocalFolderUri: "",
  wealthLocalFolderName: "",
  focusSharePath: "",
  focusLocalFolderUri: "",
  focusLocalFolderName: "",
};
function db(t) {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA_SQL);
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS integration_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL)",
  );
  sqlite.exec("PRAGMA foreign_keys=ON");
  memory.clear();
  copied.length = 0;
  folderFiles = [];
  commits = 0;
  sourceCalls = 0;
  davTransport = null;
  davEntries = [];
  failSql = "";
  active = {
    execAsync: async (sql) => sqlite.exec(sql),
    getAllAsync: async (sql, ...v) => sqlite.prepare(sql).all(...v),
    getFirstAsync: async (sql, ...v) => sqlite.prepare(sql).get(...v) ?? null,
    runAsync: async (sql, ...v) => {
      if (failSql && sql.includes(failSql))
        throw new Error("injected disk failure");
      return sqlite.prepare(sql).run(...v);
    },
    withTransactionAsync: async (task) => {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  t.after(() => sqlite.close());
  sqlite.exec(
    "INSERT INTO wealth_accounts(id,name,created_at) VALUES('keep-account','Other service',1); INSERT INTO prod_projects(id,name,color,created_at) VALUES('inbox','Inbox','red',1)",
  );
}
function empty(service) {
  return {
    format: "nlc-service",
    version: 1,
    service,
    createdAt: "2026-11-04T10:00:00Z",
    tables: Object.fromEntries(TABLES[service].map((t) => [t, []])),
    preferences:
      service === "video"
        ? { watch: [], likes: [] }
        : service === "music" || service === "podcast"
          ? { artwork: {} }
          : {},
    health:
      service === "health"
        ? {
            weights: [],
            sessions: [],
            nutrition: [],
            bodyReviews: [],
            medication: { plans: [], logs: [], alertsEnabled: false },
          }
        : null,
    integrations: [],
    links: {},
    files: [],
    roots: [],
  };
}
function stage(data) {
  return {
    id: "12345678-1234-4123-8123-123456789abc",
    metadata: JSON.stringify(data),
    files: Object.fromEntries(
      data.files.map((p) => [p, { uri: `file:///stage/${p}`, bytes: 3 }]),
    ),
    bytes: 3,
  };
}
function insertAudio(kind = "music") {
  sqlite.exec(
    `INSERT INTO artists(id,name) VALUES('artist','Edited artist'); INSERT INTO albums(id,name,artist_id,artist_name,kind) VALUES('album','Edited album','artist','Edited artist','${kind}'); INSERT INTO tracks(id,title,album_id,album_name,artist_id,artist_name,kind,on_nas,local_uri,local_bytes,offline_status) VALUES('local:content://tree/song.mp3','Edited title','album','Edited album','artist','Edited artist','${kind}',1,'content://tree/song.mp3',3,'ready'); INSERT INTO favorites VALUES(0,'local:content://tree/song.mp3'); INSERT INTO recents VALUES(0,'local:content://tree/song.mp3')`,
  );
  folderFiles = [
    { path: "Artist/Album/song.mp3", uri: "content://tree/song.mp3", bytes: 3 },
  ];
}
test("existing settings retain hybrid sources; choosing phone preserves saved NAS credentials and config", () => {
  const before = {
    ...settings,
    host: "saved-server",
    healthSharePath: "/Health",
  };
  assert.equal(sourceMode(before, "music"), "both");
  assert.equal(sourceMode(before, "health"), "local");
  const local = phoneOnly(before);
  for (const service of TABLES ? Object.keys(TABLES) : [])
    assert.equal(sourceMode(local, service), "local");
  assert.equal(local.host, "saved-server");
  assert.equal(local.healthSharePath, "/Health");
  assert.equal(
    sourceMode(withSourceMode(local, "video", "nas"), "music"),
    "local",
  );
  assert.equal(
    withLocalFolder(local, "health", "content://health", "Health")
      .healthLocalFolderUri,
    "content://health",
  );
});
test("all six empty archives validate, including a fresh phone without a NAS", async (t) => {
  db(t);
  for (const service of Object.keys(TABLES)) {
    const plan = await createArchivePlan(service, phoneOnly(settings), "");
    validateServiceArchive(plan.data, service);
    assert.equal(plan.files.length, 0);
  }
  assert.equal(sourceCalls, 0);
});
test("rejects cross-service data, arbitrary SQL columns, secrets and unsafe paths before restore", async (t) => {
  db(t);
  const good = empty("wealth");
  validateServiceArchive(good, "wealth");
  const bad = [
    { ...good, service: "focus" },
    { ...good, password: "secret" },
    { ...good, tables: { ...good.tables, meta: [] } },
    { ...good, files: ["media/../secret"] },
    { ...good, preferences: { token: "secret" } },
  ];
  for (const value of bad)
    await assert.rejects(
      restoreService(stage(value), "wealth", settings, null, "job"),
    );
  assert.equal(commits, 0);
  assert.equal(
    sqlite.prepare("SELECT name FROM wealth_accounts").get().name,
    "Other service",
  );
  for (const p of [
    "media/../x",
    "media//x",
    "/media/x",
    "media/\\x",
    "media/./x",
    "media/x\0",
  ])
    assert.equal(validArchivePath(p), false, p);
});
test("music round trip includes files, lists, favourites and edited names; source permissions are reselected", async (t) => {
  db(t);
  insertAudio();
  sqlite.exec(
    "INSERT INTO playlists VALUES('list','spotify','Road','Me',NULL,'',1,1);INSERT INTO playlist_tracks VALUES('list',0,'song','Title','Artist','Album',123,NULL,'local:content://tree/song.mp3')",
  );
  const configured = withLocalFolder(
    phoneOnly(settings),
    "music",
    "content://tree",
    "Music",
  );
  const plan = await createArchivePlan("music", configured, "DO-NOT-EXPORT");
  assert.equal(plan.files.length, 1);
  assert.ok(!JSON.stringify(plan.data).includes("DO-NOT-EXPORT"));
  assert.equal(plan.data.tables.tracks[0].local_uri, null);
  sqlite.exec(
    "DELETE FROM favorites;DELETE FROM recents;DELETE FROM playlist_tracks;DELETE FROM playlists;DELETE FROM tracks;DELETE FROM albums;DELETE FROM artists",
  );
  const next = await restoreService(
    stage(plan.data),
    "music",
    configured,
    "content://selected-destination",
    "job",
  );
  assert.equal(next.localFolderUri, "content://new-root");
  const row = sqlite.prepare("SELECT * FROM tracks").get();
  assert.equal(row.title, "Edited title");
  assert.equal(row.local_uri, "content://new-root/local/Artist/Album/song.mp3");
  assert.equal(
    sqlite.prepare("SELECT track_id FROM favorites").get().track_id,
    row.id,
  );
  assert.equal(
    sqlite.prepare("SELECT matched_id FROM playlist_tracks").get().matched_id,
    row.id,
  );
  assert.equal(
    sqlite.prepare("SELECT name FROM wealth_accounts").get().name,
    "Other service",
  );
});
test("podcast archive supports albums without artist rows and restores episode files offline", async (t) => {
  db(t);
  insertAudio("podcast");
  sqlite.exec("DELETE FROM artists");
  const configured = withLocalFolder(
    phoneOnly(settings),
    "podcast",
    "content://tree",
    "Podcasts",
  );
  const plan = await createArchivePlan("podcast", configured, "");
  assert.equal(plan.data.tables.artists.length, 0);
  await restoreService(
    stage(plan.data),
    "podcast",
    configured,
    "content://destination",
    "job",
  );
  assert.ok(
    sqlite.prepare("SELECT id FROM tracks WHERE id LIKE 'localpod:%'").get(),
  );
});
test("NAS-required export fails honestly when any active media is missing", async (t) => {
  db(t);
  insertAudio();
  sqlite.exec(
    "UPDATE tracks SET id='/Music/missing.mp3',local_uri=NULL,offline_status='none'",
  );
  await assert.rejects(
    createArchivePlan("music", settings, ""),
    /sourceUnreadable/,
  );
});
test("Health import merges dates and preserves the other services and current alert preference", async (t) => {
  db(t);
  sqlite.exec(
    "INSERT INTO health_weight_entries VALUES('2026-11-01',80,'keep',1,1)",
  );
  const data = empty("health");
  data.health.weights = [
    {
      entryDate: "2026-11-04",
      weightKg: 79,
      note: "new",
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  await restoreService(stage(data), "health", settings, null, "job");
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM health_weight_entries").get().n,
    2,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM wealth_accounts").get().n,
    1,
  );
});
test("failed import rolls back every row and imported preference as one SQLite transaction", async (t) => {
  db(t);
  const data = empty("focus");
  data.tables.prod_projects = [
    { id: "new", name: "New", color: "red", created_at: 1, archived: 0 },
  ];
  data.tables.prod_tasks = [
    {
      id: "task",
      project_id: "new",
      title: "T",
      notes: "",
      status: "todo",
      sort: 0,
      due_at: null,
      starred: 0,
      created_at: 1,
      updated_at: 1,
    },
  ];
  failSql = "INSERT OR REPLACE INTO prod_tasks";
  await assert.rejects(
    restoreService(stage(data), "focus", settings, null, "job"),
    /disk failure/,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM prod_projects WHERE id='new'").get()
      .n,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM wealth_accounts").get().n,
    1,
  );
});
test("video import remaps saved progress and likes to the new local tree atomically", async (t) => {
  db(t);
  const data = empty("video");
  data.files = ["media/nas/series/Show/episode.mp4"];
  data.roots = [{ from: "/Video", to: "nas" }];
  data.preferences.watch = [
    {
      seriesId: encodeURIComponent("/Video/series/Show"),
      seriesTitle: "Show",
      path: "/Video/series/Show/episode.mp4",
      arcPath: "/Video/series/Show",
      sagaPath: "/Video/series/Show",
      number: 1,
      title: "Episode",
      arcTitle: "Arc",
      sagaTitle: "Saga",
      positionSec: 125,
      durationSec: 500,
      watchedAt: 2,
    },
  ];
  data.preferences.likes = [
    { id: "old", path: "/Video/series/Show", title: "Show", kind: "series" },
  ];
  await restoreService(
    stage(data),
    "video",
    settings,
    "content://destination",
    "job",
  );
  const watch = JSON.parse(
    sqlite
      .prepare("SELECT value FROM meta WHERE key=?")
      .get("service_preference:nlc.video.watch.v2").value,
  );
  assert.equal(watch[0].positionSec, 125);
  assert.equal(watch[0].path, "/local-video/nas/series/Show/episode.mp4");
  const likes = JSON.parse(
    sqlite
      .prepare("SELECT value FROM meta WHERE key=?")
      .get("service_preference:nlc.video.likes.v1").value,
  );
  assert.equal(likes[0].path, "/local-video/nas/series/Show");
});
test("orphan references, duplicate IDs, invalid reminders and missing linked photos are rejected", () => {
  const focus = empty("focus");
  focus.tables.prod_tasks = [
    {
      id: "task",
      project_id: "missing",
      title: "T",
      notes: "",
      status: "todo",
      sort: 0,
      due_at: null,
      starred: 0,
      created_at: 1,
      updated_at: 1,
    },
  ];
  assert.throws(() => validateServiceArchive(focus, "focus"));
  const copy = empty("wealth");
  copy.tables.wealth_accounts = [
    {
      id: "a",
      name: "A",
      kind: "cash",
      currency: "EUR",
      created_at: 1,
      archived: 0,
    },
    {
      id: "a",
      name: "A",
      kind: "cash",
      currency: "EUR",
      created_at: 1,
      archived: 0,
    },
  ];
  assert.throws(() => validateServiceArchive(copy, "wealth"));
});

test("reimporting a music copy updates the same records and references instead of duplicating the library", async (t) => {
  db(t);
  insertAudio();
  const configured = withLocalFolder(
    phoneOnly(settings),
    "music",
    "content://tree",
    "Music",
  );
  const plan = await createArchivePlan("music", configured, "");
  await restoreService(
    stage(plan.data),
    "music",
    configured,
    "content://destination",
    "first",
  );
  await restoreService(
    stage(plan.data),
    "music",
    configured,
    "content://destination",
    "second",
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM tracks WHERE kind='music'").get().n,
    1,
  );
  assert.equal(sqlite.prepare("SELECT count(*) n FROM favorites").get().n, 1);
  assert.equal(
    sqlite.prepare("SELECT track_id FROM favorites").get().track_id,
    sqlite.prepare("SELECT id FROM tracks").get().id,
  );
});
test("local scans preserve imported titles, durations and album names", async (t) => {
  db(t);
  insertAudio();
  const catalog = require(root + "/src/lib/db/catalog.ts");
  const id = "local:content://tree/song.mp3";
  const track = {
    id,
    title: "Derived filename",
    albumId: "new-album",
    albumName: "Derived album",
    artistId: "new-artist",
    artistName: "Derived artist",
    durationMs: 0,
  };
  await catalog.upsertLocalLibrary(
    {
      artists: [{ id: "new-artist", name: "Derived artist" }],
      albums: [
        {
          id: "new-album",
          name: "Derived album",
          artistId: "new-artist",
          artistName: "Derived artist",
        },
      ],
      tracks: [track],
      albumTracks: { "new-album": [track] },
      scannedAt: 1,
    },
    new Map([[id, { uri: "content://tree/song.mp3", bytes: 3 }]]),
    "local:content://tree",
  );
  const row = sqlite.prepare("SELECT title, album_name FROM tracks").get();
  assert.equal(row.title, "Edited title");
  assert.equal(row.album_name, "Edited album");
});
test("Health photos use new private IDs and reject mismatched file sizes before writing", async (t) => {
  db(t);
  const data = empty("health");
  data.health.bodyReviews = [
    {
      id: "review",
      date: "2026-11-03",
      note: "Photo",
      photos: {
        front: {
          id: "photo-before",
          mime: "image/jpeg",
          bytes: 3,
          width: 1,
          height: 1,
        },
      },
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  data.files = ["media/photos/photo-before.jpg"];
  data.links = { "photo:photo-before": data.files[0] };
  await restoreService(stage(data), "health", settings, null, "job");
  const review = JSON.parse(
    sqlite.prepare("SELECT payload FROM health_body_reviews").get().payload,
  );
  assert.notEqual(review.photos.front.id, "photo-before");
  assert.equal(copied.length, 1);
  const corrupt = stage(data);
  corrupt.files[data.files[0]].bytes = 5;
  await assert.rejects(
    restoreService(corrupt, "health", settings, null, "job"),
    /integrity/,
  );
  assert.equal(
    copied.length,
    1,
    "reject wrong photo bytes before writing files",
  );
});
test("wealth copies include cached Mercury and its selected mode, preserve credentials, and reject a different live owner", async (t) => {
  db(t);
  const { mercuryExample } = require(
    root + "/src/lib/integrations/mercury-demo.ts",
  );
  const example = mercuryExample("2026-11-04T10:00:00Z");
  const data = empty("wealth");
  data.integrations = [example];
  data.preferences.selectedMode = "demo";
  await restoreService(stage(data), "wealth", settings, null, "job");
  const row = sqlite
    .prepare(
      "SELECT payload FROM integration_cache WHERE key='nlc.integrations.v1.mercury.demo'",
    )
    .get();
  assert.equal(JSON.parse(row.payload).transactions.length, 21);
  assert.equal(
    JSON.parse(
      sqlite
        .prepare("SELECT value FROM meta WHERE key=?")
        .get("service_preference:nlc.integrations.selection.v1").value,
    ).mercury,
    "demo",
  );
  const live = { ...example, mode: "live", owner: "mercury:existing-company" };
  sqlite
    .prepare("INSERT INTO integration_cache VALUES(?,?)")
    .run("nlc.integrations.v1.mercury.live", JSON.stringify(live));
  data.integrations = [{ ...live, owner: "mercury:other-company" }];
  await assert.rejects(
    restoreService(stage(data), "wealth", settings, null, "job"),
    /accountChanged/,
  );
  assert.equal(
    JSON.parse(
      sqlite
        .prepare(
          "SELECT payload FROM integration_cache WHERE key='nlc.integrations.v1.mercury.live'",
        )
        .get().payload,
    ).owner,
    live.owner,
  );
});
test("imported tasks and finances receive a durable epoch so older folder mirrors cannot replace them on restart", async (t) => {
  db(t);
  const data = empty("wealth");
  await restoreService(stage(data), "wealth", settings, null, "job");
  const { dumpWealth } = require(root + "/src/lib/wealth/store.ts");
  const result = await dumpWealth();
  assert.ok(result.updatedAt > Date.now() - 10000);
  assert.equal(
    sqlite.prepare("SELECT name FROM wealth_accounts").get().name,
    "Other service",
  );
});
test("a reordered but valid playlist archive imports tracks after the playlist header", async (t) => {
  db(t);
  insertAudio();
  const configured = withLocalFolder(
    phoneOnly(settings),
    "music",
    "content://tree",
    "Music",
  );
  sqlite.exec(
    "INSERT INTO playlists VALUES('list','spotify','Road','Me',NULL,'',1,1);INSERT INTO playlist_tracks VALUES('list',0,'song','Title','Artist','Album',123,NULL,'local:content://tree/song.mp3')",
  );
  const { data } = await createArchivePlan("music", configured, "");
  data.tables = Object.fromEntries(Object.entries(data.tables).reverse());
  await restoreService(
    stage(data),
    "music",
    configured,
    "content://destination",
    "job",
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT count(*) n FROM playlist_tracks WHERE playlist_id='list'",
      )
      .get().n,
    1,
  );
});

test("archive schema covers every portable database column", (t) => {
  db(t);
  const { ARCHIVE_COLUMNS } = require(
    root + "/src/lib/service-backup/schema.ts",
  );
  for (const [table, columns] of Object.entries(ARCHIVE_COLUMNS))
    assert.deepEqual(
      Object.keys(columns).sort(),
      sqlite
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name)
        .sort(),
      table,
    );
  assert.equal(
    validArchivePath("media/local/.nlc-importing-123/file.mp3"),
    false,
  );
});
test("local video virtual IDs include indexed media even when local_uri is absent", async (t) => {
  db(t);
  sqlite.exec(
    "INSERT INTO tracks(id,title,album_id,album_name,artist_id,artist_name,kind,on_nas,offline_status) VALUES('/local-video/series/Demo/Offline.mp4','Offline','demo','Demo','','','video',0,'ready')",
  );
  folderFiles = [
    { path: "series/Demo/Offline.mp4", uri: "content://video/file", bytes: 3 },
  ];
  const plan = await createArchivePlan(
    "video",
    withLocalFolder(phoneOnly(settings), "video", "content://video", "Video"),
    "",
  );
  assert.equal(plan.data.tables.tracks.length, 1);
  assert.equal(
    plan.data.links["track:/local-video/series/Demo/Offline.mp4"],
    "media/local/series/Demo/Offline.mp4",
  );
});
test("download cleanup preserves original source folder media", async (t) => {
  db(t);
  insertAudio();
  sqlite.exec(
    "INSERT INTO tracks(id,title,album_id,album_name,artist_id,artist_name,kind,on_nas,local_uri,local_bytes,offline_status) VALUES('/NAS/song.mp3','Downloaded','album','Album','artist','Artist','music',1,'file:///cache/download.mp3',3,'ready')",
  );
  const catalog = require(root + "/src/lib/db/catalog.ts");
  assert.equal(
    await catalog.clearLocalCopy("local:content://tree/song.mp3"),
    null,
  );
  assert.deepEqual(await catalog.clearLocalCopies("music"), [
    "file:///cache/download.mp3",
  ]);
  assert.equal(
    sqlite
      .prepare("SELECT local_uri FROM tracks WHERE id=?")
      .get("local:content://tree/song.mp3").local_uri,
    "content://tree/song.mp3",
  );
});
test("WebDAV export obtains fresh per-file authorization and renews it after a challenge", async (t) => {
  db(t);
  let nonce = 1;
  const methods = [];
  davTransport = {
    absolute: (p) => `https://nas.example.test${p}`,
    session: {
      authorization: (method, uri) => `${method} nonce=${nonce} ${uri}`,
    },
    davFetch: async (p, options) => {
      methods.push(options.method);
      if (options.method === "HEAD") nonce++;
      return { ok: true, status: 200, text: async () => "" };
    },
  };
  davEntries = [{ path: "/Music/song.mp3", dir: false, size: 3 }];
  const configured = withSourceMode(
    { ...settings, host: "nas.example.test", sharePath: "/Music" },
    "music",
    "nas",
  );
  const plan = await createArchivePlan("music", configured, "private-password");
  assert.equal(plan.files[0].headers, undefined);
  assert.equal(JSON.stringify(plan.data).includes("private-password"), false);
  assert.match(
    (await plan.authorize(plan.files[0].uri, false)).Authorization,
    /nonce=1/,
  );
  assert.match(
    (await plan.authorize(plan.files[0].uri, true)).Authorization,
    /nonce=2/,
  );
  assert.deepEqual(methods, ["PROPFIND", "HEAD"]);
  await assert.rejects(
    plan.authorize("https://other.example.test/file", false),
    /sourceUnreadable/,
  );
});

test("a scan finishing after restore cannot reinsert the previous source files", async (t) => {
  db(t);
  insertAudio();
  const oldId = "local:content://tree/song.mp3";
  const plan = await createArchivePlan(
    "music",
    withLocalFolder(phoneOnly(settings), "music", "content://tree", "Music"),
    "",
  );
  await restoreService(
    stage(plan.data),
    "music",
    settings,
    "content://destination",
    "job",
  );
  const track = {
    id: oldId,
    title: "Stale scan",
    albumId: "album",
    albumName: "Album",
    artistId: "artist",
    artistName: "Artist",
    durationMs: 0,
  };
  const catalog = require(root + "/src/lib/db/catalog.ts");
  await catalog.upsertLocalLibrary(
    {
      artists: [],
      albums: [],
      tracks: [track],
      albumTracks: { album: [track] },
      scannedAt: 1,
    },
    new Map([[oldId, { uri: "content://tree/song.mp3", bytes: 3 }]]),
    "local:content://tree",
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM tracks WHERE kind='music'").get()
      .n,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM tracks WHERE id=?").get(oldId).n,
    0,
  );
});

test("desktop restore retains every configured folder and source mode", async t => {
 db(t); insertAudio();
 const configured = withLocalFolder(settings, "music", "content://tree", "Music");
 const plan = await createArchivePlan("music", configured, "");
 sqlite.prepare("INSERT INTO meta(key,value) VALUES('nas_settings',?)").run(JSON.stringify(configured));
 const next = await restoreService(stage(plan.data), "music", configured, "content://tree", "remote-owned-job", { preserveSources: true });
 assert.deepEqual(next, configured); assert.deepEqual(JSON.parse(sqlite.prepare("SELECT value FROM meta WHERE key='nas_settings'").get().value), configured);
 assert.equal(sourceMode(next, "music"), sourceMode(configured, "music"));
});
test("cancelling before commit leaves existing records and configured folders intact", async t => {
 db(t); insertAudio(); const configured = withLocalFolder(phoneOnly(settings), "music", "content://tree", "Music");
 const plan = await createArchivePlan("music", configured, ""); const before = sqlite.prepare("SELECT id,title FROM tracks").all();
 await assert.rejects(restoreService(stage(plan.data), "music", configured, "content://tree", "remote-cancelled-job", { preserveSources: true, beforeCommit: async () => { throw new Error("cancelled"); } }), /cancelled/);
 assert.deepEqual(sqlite.prepare("SELECT id,title FROM tracks").all(), before);
});
