import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
const root = path.resolve(import.meta.dirname, "..");
const output = mkdtempSync(path.join(tmpdir(), "nlc-phone-web-"));
try {
 const env = { ...process.env, EXPO_PUBLIC_NLC_WEB_REMOTE: "1", EXPO_PUBLIC_NLC_DEMO: "0", EXPO_NO_TELEMETRY: "1", EXPO_OFFLINE: "1", CI: "1" };
 delete env.NODE_ENV;
 const result = spawnSync(process.execPath, [path.join(root, "node_modules/expo/bin/cli"), "export", "--clear", "--platform", "web", "--output-dir", output], { cwd: root, env, stdio: "inherit" });
 if (result.status !== 0) process.exit(result.status || 1);
 const html = path.join(output, "index.html");
 writeFileSync(html, readFileSync(html, "utf8").replace("</head>", '<meta name="nlc-web-bundle" content="__NLC_BUNDLE_ID__"/></head>'));
 const entries = {}; const files = [];
 function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
   const full = path.join(directory, entry.name);
   if (entry.isDirectory()) walk(full); else {
    const name = path.relative(output, full).split(path.sep).join("/");
    if (name.endsWith(".map") || name === "metadata.json") continue;
    const bytes = readFileSync(full); entries[name] = bytes; files.push({ path: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
   }
  }
 }
 walk(output);
 const bundleId = createHash("sha256").update(files.map(file => `${file.path}\t${file.sha256}\t${file.bytes}`).join("\n")).digest("hex");
 entries["manifest.json"] = new TextEncoder().encode(JSON.stringify({ protocol: 1, bundleId, files }));
 mkdirSync(path.join(root, "assets/generated"), { recursive: true });
 writeFileSync(path.join(root, "assets/generated/phone-web.zip"), zipSync(entries, { level: 6 }));
 console.log(`NLC web: ${files.length} assets · ${bundleId}`);
} finally { rmSync(output, { recursive: true, force: true }); }
