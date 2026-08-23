#!/usr/bin/env node
/**
 * Full APK when OTA is not enough (native / system changes).
 * Bumps version, builds with EAS, replaces the GitHub Release APK, notifies phones.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bump = process.argv[2] || "patch";
const notes = process.argv.slice(3).join(" ").trim();

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error((opts.capture ? result.stderr : "") || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

const bumped = run("node", ["scripts/bump-apk-version.mjs", bump], { capture: true }).trim();
const match = bumped.match(/^(\S+)\s+\((\d+)\)$/);
if (!match) throw new Error(`No se pudo leer la versión: ${bumped}`);
const version = match[1];
const versionCode = match[2];
console.log(`Versión APK ${version} (${versionCode})`);

run("npx", [
  "eas-cli",
  "build",
  "--platform",
  "android",
  "--profile",
  "github",
  "--non-interactive",
  "--wait",
]);

const listRaw = run(
  "npx",
  ["eas-cli", "build:list", "--platform", "android", "--limit", "1", "--non-interactive", "--json", "--status", "finished"],
  { capture: true },
);
const parsed = JSON.parse(listRaw);
const builds = Array.isArray(parsed) ? parsed : parsed.builds || parsed.data || [];
const build = builds[0];
const url =
  build?.artifacts?.buildUrl ||
  build?.artifacts?.applicationArchiveUrl ||
  build?.applicationArchiveUrl;
if (!url) {
  throw new Error("EAS no devolvió la URL de la APK. Revisa el build en expo.dev.");
}

const apkPath = path.join(os.tmpdir(), "NLC.apk");
const apk = await fetch(url);
if (!apk.ok) throw new Error(`No se pudo bajar la APK (${apk.status})`);
fs.writeFileSync(apkPath, Buffer.from(await apk.arrayBuffer()));
console.log(`APK ${Math.round(fs.statSync(apkPath).size / 1024 / 1024)} MB`);

run("node", ["scripts/publish-github-apk.mjs", apkPath, version, versionCode, notes]);
run("node", ["scripts/notify-ota.mjs", "apk"]);
