#!/usr/bin/env node
/**
 * Settings must not pull expo-camera (Hermes inlines it; missing native = crash).
 * Also scans the already-exported Android Hermes bundle when dist/ exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");
const entry = path.join(srcRoot, "app/(tabs)/settings.tsx");
const forbidden = new Set(["expo-camera"]);
const importRe =
  /(?:import\s+(?:type\s+)?[\s\S]*?from\s*|import\s*\(|export\s+\*\s+from\s*|export\s+\{[\s\S]*?\}\s*from\s*|require\s*\()\s*['"]([^'"]+)['"]/g;

function resolveImport(fromFile, spec) {
  if (spec.startsWith("@/")) {
    return resolveFile(path.join(srcRoot, spec.slice(2)));
  }
  if (spec.startsWith(".")) {
    return resolveFile(path.join(path.dirname(fromFile), spec));
  }
  return spec;
}

function resolveFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function packageName(spec) {
  if (spec.startsWith(".") || spec.startsWith("@/")) return null;
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.slice(0, 2).join("/");
  }
  return spec.split("/")[0];
}

const visited = new Set();
const nativeHits = [];

function walk(file) {
  const abs = path.resolve(file);
  if (visited.has(abs)) return;
  visited.add(abs);
  const text = fs.readFileSync(abs, "utf8");
  importRe.lastIndex = 0;
  let match;
  while ((match = importRe.exec(text))) {
    const spec = match[1];
    const pkg = packageName(spec);
    if (pkg && forbidden.has(pkg)) {
      nativeHits.push(`${path.relative(root, abs)} → ${spec}`);
      continue;
    }
    const next = resolveImport(abs, spec);
    if (next && next.startsWith(srcRoot)) walk(next);
  }
}

if (!fs.existsSync(entry)) {
  console.error(`Missing ${path.relative(root, entry)}`);
  process.exit(1);
}

walk(entry);

const distDir = path.join(root, "dist/_expo/static/js/android");
let bundleHit = false;
if (fs.existsSync(distDir)) {
  for (const name of fs.readdirSync(distDir)) {
    if (!name.endsWith(".hbc") && !name.endsWith(".js")) continue;
    const buf = fs.readFileSync(path.join(distDir, name));
    if (buf.includes(Buffer.from("ExpoCamera")) || buf.includes(Buffer.from("expo-camera"))) {
      bundleHit = true;
      nativeHits.push(`dist android bundle ${name} contains ExpoCamera/expo-camera`);
    }
  }
}

console.log(`Settings import graph: ${visited.size} files`);
if (nativeHits.length) {
  console.error("expo-camera still reachable from Settings:");
  for (const hit of nativeHits) console.error(`  ${hit}`);
  process.exit(1);
}
if (bundleHit) process.exit(1);
console.log("OK: Settings source (and dist Android bundle, if present) do not load expo-camera.");
