#!/usr/bin/env node
/**
 * Expo Go Android sends Expo-Platform twice. Node joins that into
 * "android, android" and @expo/cli 500s the manifest ("Something went wrong").
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 1. Fix Expo CLI platform header
const file = path.join(
  root,
  "node_modules/expo/node_modules/@expo/cli/build/src/start/server/middleware/resolvePlatform.js",
);
if (fs.existsSync(file)) {
  const src = fs.readFileSync(file, "utf8");
  const from = "return (Array.isArray(platform) ? platform[0] : platform) ?? null;";
  const to = `const raw = Array.isArray(platform) ? platform[0] : platform;
    return raw ? String(raw).split(",")[0].trim() : null;`;
  if (src.includes(from)) {
    fs.writeFileSync(file, src.replace(from, to));
  }
}

// 2. Patch expo-audio with NLC media notification fixes
try {
  const withMediaSkip = require("../plugins/with-media-skip-buttons.js");
  if (typeof withMediaSkip.patchExpoAudio === "function") {
    withMediaSkip.patchExpoAudio(root);
  }
} catch (e) {
  console.warn("[postinstall] failed to patch expo-audio:", e);
}
