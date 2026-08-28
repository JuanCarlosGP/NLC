#!/usr/bin/env node
/**
 * Expo Go Android sends Expo-Platform twice. Node joins that into
 * "android, android" and @expo/cli 500s the manifest ("Something went wrong").
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(
  root,
  "node_modules/expo/node_modules/@expo/cli/build/src/start/server/middleware/resolvePlatform.js",
);
if (!fs.existsSync(file)) process.exit(0);

const src = fs.readFileSync(file, "utf8");
const from = "return (Array.isArray(platform) ? platform[0] : platform) ?? null;";
const to = `const raw = Array.isArray(platform) ? platform[0] : platform;
    return raw ? String(raw).split(",")[0].trim() : null;`;
if (!src.includes(from)) process.exit(0);
fs.writeFileSync(file, src.replace(from, to));
