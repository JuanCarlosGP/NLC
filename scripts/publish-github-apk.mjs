#!/usr/bin/env node
/**
 * Keeps a single GitHub Release (`apk`) with one asset: SND.apk.
 * Previous binaries are replaced, not accumulated.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const apkPath = process.argv[2];
const version = process.argv[3] || "0.0.0";
const versionCode = process.argv[4] || "?";
const notes = process.argv.slice(5).join(" ").trim();

if (!apkPath || !fs.existsSync(apkPath)) {
  console.error("Uso: node scripts/publish-github-apk.mjs <SND.apk> <version> <versionCode> [notas]");
  process.exit(1);
}

const title = `SND ${version} (${versionCode})`;
const body = [
  `APK completa **${version}** · versionCode **${versionCode}**.`,
  "",
  "Esta release **solo guarda la última APK** (`SND.apk`). El código sigue versionado en `main`.",
  "",
  "Instálala cuando el cambio sea nativo (plugins, permisos, Expo SDK, notificaciones…). El JS cotidiano va por OTA.",
  "",
  notes ? notes : "",
  "",
  "Descarga directa: https://github.com/JuanCarlosGP/SND/releases/latest/download/SND.apk",
]
  .filter((line) => line !== undefined)
  .join("\n")
  .trim();

function gh(args, opts = {}) {
  const result = spawnSync("gh", args, { encoding: "utf8", stdio: opts.capture ? "pipe" : "inherit" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `gh ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

function releaseExists() {
  const result = spawnSync("gh", ["release", "view", "apk"], { encoding: "utf8", stdio: "pipe" });
  return result.status === 0;
}

if (releaseExists()) {
  const raw = gh(["release", "view", "apk", "--json", "assets"], { capture: true });
  const assets = JSON.parse(raw).assets ?? [];
  for (const asset of assets) {
    if (asset.name && asset.name !== "SND.apk") {
      gh(["release", "delete-asset", "apk", asset.name, "--yes"]);
    }
  }
  gh(["release", "upload", "apk", `${apkPath}#SND.apk`, "--clobber"]);
  gh(["release", "edit", "apk", "--title", title, "--notes", body, "--latest"]);
} else {
  gh(["release", "create", "apk", `${apkPath}#SND.apk`, "--title", title, "--notes", body, "--latest"]);
}

console.log(`GitHub Release actualizado: ${title}`);
console.log("https://github.com/JuanCarlosGP/SND/releases/latest/download/SND.apk");
