#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const configPath = path.join(root, "app.config.js");

const bumpKind = process.argv[2] || "patch";

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const [major, minor, patch] = String(pkg.version)
  .split(".")
  .map((part) => Number(part) || 0);

let nextVersion = pkg.version;
if (bumpKind === "major") nextVersion = `${major + 1}.0.0`;
else if (bumpKind === "minor") nextVersion = `${major}.${minor + 1}.0`;
else if (bumpKind === "patch") nextVersion = `${major}.${minor}.${patch + 1}`;
else if (bumpKind !== "none") {
  console.error("Uso: node scripts/bump-apk-version.mjs [patch|minor|major|none]");
  process.exit(1);
}

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const config = fs.readFileSync(configPath, "utf8");
const match = config.match(/versionCode:\s*(\d+)/);
if (!match) {
  console.error("No se encontró versionCode en app.config.js");
  process.exit(1);
}
const versionCode = Number(match[1]) + 1;
fs.writeFileSync(configPath, config.replace(/versionCode:\s*\d+/, `versionCode: ${versionCode}`));

const output = process.env.GITHUB_OUTPUT;
if (output) {
  fs.appendFileSync(output, `version=${nextVersion}\nversionCode=${versionCode}\n`);
}

console.log(`${nextVersion} (${versionCode})`);
