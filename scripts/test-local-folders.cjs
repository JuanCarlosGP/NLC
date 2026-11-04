const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith("@/"))
    request = path.join(root, "src", request.slice(2));
  return resolve.call(this, request, parent, ...rest);
};
const platform = { OS: "android" };
const parent =
  "content://com.android.externalstorage.documents/tree/primary%3ANLC";
const settings = {
  sourceKind: "local",
  localFolderUri: "old-music",
  localFolderName: "Old",
  host: "saved-host",
  serviceSources: { music: "local", health: "local" },
};
let children, created, files, failAt;
const childUri = (name) =>
  parent + "/document/" + encodeURIComponent("primary:NLC/" + name);
const saf = {
  async readDirectoryAsync(uri) {
    if (files.has(uri)) throw new Error("not a directory");
    if (uri === parent) return [...children];
    if (!children.includes(uri)) throw new Error("permission revoked");
    return [];
  },
  async makeDirectoryAsync(uri, name) {
    assert.equal(uri, parent);
    if (name === failAt) throw new Error("write denied");
    const child = childUri(name);
    assert.ok(!children.includes(child), "must reuse existing directories");
    children.push(child);
    created.push(name);
    return child;
  },
};
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "react-native") return { Platform: platform };
  if (request === "expo-file-system/legacy")
    return { StorageAccessFramework: saf };
  if (request === "@/lib/i18n/runtime") return { t: (key) => key };
  return load.call(this, request, ...rest);
};
const { prepareLocalRoot, SERVICE_FOLDER_NAMES } = require(
  root + "/src/lib/local/root-folder.ts",
);
const { localFolder, withLocalFolder } = require(
  root + "/src/lib/settings/service-source.ts",
);
const { registerWebDirectoryHandle, getWebDirectoryHandle } = require(
  root + "/src/lib/local/pick-folder.ts",
);
const folder = { uri: parent, name: "NLC" };
function reset() {
  platform.OS = "android";
  children = [];
  created = [];
  files = new Set();
  failAt = "";
}

test("one root configures six distinct child folders without changing unrelated settings", async () => {
  reset();
  const before = structuredClone(settings);
  const next = await prepareLocalRoot(settings, folder);
  assert.deepEqual(created, Object.values(SERVICE_FOLDER_NAMES));
  assert.deepEqual(settings, before);
  for (const [service, name] of Object.entries(SERVICE_FOLDER_NAMES))
    assert.deepEqual(localFolder(next, service), {
      uri: childUri(name),
      name: "NLC/" + name,
    });
  assert.equal(next.localRootFolderUri, parent);
  assert.equal(next.host, settings.host);
  assert.deepEqual(next.serviceSources, settings.serviceSources);
});
test("choosing the same root reuses all six directories and leaves their files intact", async () => {
  reset();
  const first = await prepareLocalRoot(settings, folder);
  const originalChildren = [...children];
  created = [];
  const next = await prepareLocalRoot(first, folder);
  assert.deepEqual(next, first);
  assert.deepEqual(children, originalChildren);
  assert.deepEqual(created, []);
});
test("a file with a service folder name fails before creating any directories", async () => {
  reset();
  const uri = childUri("Health");
  children.push(uri);
  files.add(uri);
  await assert.rejects(prepareLocalRoot(settings, folder), /not a directory/);
  assert.deepEqual(created, []);
  assert.equal(settings.localFolderUri, "old-music");
  assert.ok(files.has(uri));
});
test("a failed creation leaves the draft unchanged and a retry reuses the new empty folders", async () => {
  reset();
  failAt = "Tasks";
  await assert.rejects(prepareLocalRoot(settings, folder), /write denied/);
  assert.equal(settings.localFolderUri, "old-music");
  const initial = [...created];
  failAt = "";
  const next = await prepareLocalRoot(settings, folder);
  assert.equal(children.length, 6);
  assert.equal(created.length, 6);
  assert.deepEqual(initial, ["Music", "Podcasts", "Video"]);
  assert.equal(localFolder(next, "health").uri, childUri("Health"));
});
test("case-insensitive existing names are reused; ambiguous matches are rejected", async () => {
  reset();
  children.push(childUri("music"));
  const next = await prepareLocalRoot(settings, folder);
  assert.equal(localFolder(next, "music").uri, childUri("music"));
  assert.ok(!created.includes("Music"));
  reset();
  children.push(childUri("Music"), childUri("music"));
  await assert.rejects(prepareLocalRoot(settings, folder), /rootFolder/);
  assert.deepEqual(created, []);
});
test("individual overrides remain possible after assigning a general folder", async () => {
  reset();
  const grouped = await prepareLocalRoot(settings, folder);
  const next = withLocalFolder(grouped, "health", "custom-health", "Custom");
  assert.equal(localFolder(next, "health").uri, "custom-health");
  assert.equal(
    localFolder(next, "music").uri,
    localFolder(grouped, "music").uri,
  );
  assert.equal(next.localRootFolderUri, parent);
});
test("browser child handles are registered for the existing media and data readers", async () => {
  reset();
  platform.OS = "web";
  const handles = new Map();
  const handle = {
    name: "NLC",
    kind: "directory",
    async getDirectoryHandle(name, options) {
      assert.equal(options.create, true);
      if (!handles.has(name)) handles.set(name, { name, kind: "directory" });
      return handles.get(name);
    },
  };
  registerWebDirectoryHandle(handle, "webdir:grouped");
  const next = await prepareLocalRoot(settings, {
    uri: "webdir:grouped",
    name: "NLC",
  });
  for (const [service, name] of Object.entries(SERVICE_FOLDER_NAMES))
    assert.equal(
      getWebDirectoryHandle(localFolder(next, service).uri),
      handles.get(name),
    );
  assert.equal(handles.size, 6);
});
test("unsupported storage providers cannot create duplicate folders from opaque IDs", async () => {
  reset();
  await assert.rejects(
    prepareLocalRoot(settings, {
      uri: "content://other.provider/tree/42",
      name: "Other",
    }),
    /rootFolder/,
  );
  assert.deepEqual(created, []);
});

test("the browser root picker requests write access before creating service folders", async (t) => {
  reset();
  platform.OS = "web";
  const previous = globalThis.showDirectoryPicker;
  t.after(() => {
    globalThis.showDirectoryPicker = previous;
  });
  let received;
  globalThis.showDirectoryPicker = async (options) => {
    received = options;
    return { name: "Writable", kind: "directory" };
  };
  const { pickLocalFolder } = require(root + "/src/lib/local/pick-folder.ts");
  const selected = await pickLocalFolder({ writable: true });
  assert.deepEqual(received, { mode: "readwrite" });
  assert.equal(selected.name, "Writable");
});
test("cancelling the browser root picker leaves the setup unchanged", async (t) => {
  reset();
  platform.OS = "web";
  const previous = globalThis.showDirectoryPicker;
  t.after(() => {
    globalThis.showDirectoryPicker = previous;
  });
  globalThis.showDirectoryPicker = async () => {
    throw Object.assign(new Error("cancelled"), { name: "AbortError" });
  };
  const { pickLocalFolder } = require(root + "/src/lib/local/pick-folder.ts");
  assert.equal(await pickLocalFolder({ writable: true }), null);
  assert.deepEqual(created, []);
});
