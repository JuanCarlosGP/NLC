#!/usr/bin/env node
/**
 * After `eas update` / APK release, ping every APK that registered its Expo
 * push token (Music/nlc-push-tokens.json on the NAS, plus EXPO_PUSH_TOKEN).
 *
 * Android needs FCM V1 credentials on the EAS project once:
 *   eas credentials  → Android → production → FCM V1
 *
 * Credentials: env, then gitignored `.env` / `.secrets/*`.
 * See `.env.example`. Do not commit NAS passwords.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const DEFAULT_PASSWORD = "Viewer";

loadEnvFiles();

const kind = process.argv[2] === "preview" ? "preview" : process.argv[2] === "apk" ? "apk" : "production";
const APK_URL = "https://github.com/JuanCarlosGP/NLC/releases/latest";
const host = process.env.NLC_NAS_HOST || "192.168.1.106";
const port = process.env.NLC_NAS_PORT || "5005";
const user = process.env.NLC_NAS_USER || "Viewer";
const password =
  process.env.NLC_NAS_PASSWORD ||
  process.env.NLC_NAS_PASS ||
  process.env.SND_NAS_PASSWORD ||
  process.env.SND_NAS_PASS ||
  DEFAULT_PASSWORD;
const share = process.env.NLC_NAS_SHARE || "/Music/nlc-push-tokens.json";
const extra = (process.env.EXPO_PUSH_TOKEN || process.env.EXPO_PUSH_TOKENS || "")
  .split(/[,\s]+/)
  .map((item) => item.trim())
  .filter(Boolean);
const usedDefaultPassword =
  !process.env.NLC_NAS_PASSWORD &&
  !process.env.NLC_NAS_PASS &&
  !process.env.SND_NAS_PASSWORD &&
  !process.env.SND_NAS_PASS;

function loadEnvFiles() {
  const files = [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".secrets", "nas.env"),
    path.join(root, ".secrets", "nlc.env"),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const cut = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!cut) continue;
      const key = cut[1];
      let value = cut[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
    }
  }
}

function toWebDavPath(rawPath) {
  const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return normalized.replace(/^\/volume\d+(?=\/|$)/i, "") || "/";
}

function encodeDavPath(rawPath) {
  return toWebDavPath(rawPath)
    .split("/")
    .map((part) => (part ? encodeURIComponent(part) : ""))
    .join("/");
}

function md5(value) {
  return createHash("md5").update(value).digest("hex");
}

function parseDigest(header) {
  if (!header || !/digest/i.test(header)) return null;
  const realm = header.match(/realm="([^"]*)"/i)?.[1];
  const nonce = header.match(/nonce="([^"]*)"/i)?.[1];
  if (!realm || !nonce) return null;
  return {
    realm,
    nonce,
    qop: header.match(/qop="?([^",\s]+)/i)?.[1],
    opaque: header.match(/opaque="([^"]*)"/i)?.[1],
    algorithm: header.match(/algorithm=([^,\s]+)/i)?.[1],
  };
}

function digestHeader(method, requestPath, challenge, nc) {
  const uri = requestPath.startsWith("http") ? new URL(requestPath).pathname : requestPath;
  const ha1 = md5(`${user}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const ncHex = nc.toString(16).padStart(8, "0");
  const cnonce = md5(`${Date.now()}-${nc}`);
  const response = challenge.qop
    ? md5(`${ha1}:${challenge.nonce}:${ncHex}:${cnonce}:${challenge.qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);
  const parts = [
    `username="${user}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  if (challenge.qop) parts.push(`qop=${challenge.qop}`, `nc=${ncHex}`, `cnonce="${cnonce}"`);
  return `Digest ${parts.join(", ")}`;
}

function basicHeader() {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

async function davGet(url) {
  let response = await fetch(url, { headers: { Authorization: basicHeader() } });
  if (response.status !== 401) return response;
  const challenge = parseDigest(response.headers.get("www-authenticate") ?? "");
  if (!challenge) return response;
  return fetch(url, { headers: { Authorization: digestHeader("GET", url, challenge, 1) } });
}

async function tokensFromNas() {
  if (usedDefaultPassword) {
    console.warn(`Sin NLC_NAS_PASSWORD en el entorno: se usa ${user} / ${DEFAULT_PASSWORD}.`);
  }
  const url = `http://${host}:${port}${encodeDavPath(share)}`;
  let response;
  try {
    response = await davGet(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`No se pudo hablar con el NAS (${url}): ${detail}`);
    console.warn("El aviso de Ajustes sigue saliendo (GitHub). El push necesita el NAS o EXPO_PUSH_TOKEN.");
    return [];
  }
  if (response.status === 404) {
    console.warn(`No hay ${share} en el NAS. Abre la APK una vez con el NAS conectado para registrar el teléfono.`);
    return [];
  }
  if (!response.ok) {
    console.warn(`NAS HTTP ${response.status} al leer ${url}`);
    console.warn("Revisa usuario/contraseña (NLC_NAS_PASSWORD o .env / .secrets/nas.env).");
    return [];
  }
  const parsed = await response.json();
  const tokens = Array.isArray(parsed?.tokens) ? parsed.tokens : [];
  return tokens.map((item) => (typeof item === "string" ? item : item?.token)).filter(Boolean);
}

async function send(tokens) {
  const unique = [...new Set(tokens)];
  if (!unique.length) {
    console.warn("No hay tokens de push. No se envió notificación al teléfono.");
    console.warn("Ajustes puede mostrar «Hay una APK nueva» igual: eso es un sondeo a GitHub, no FCM.");
    console.warn("Para el próximo push: abre la APK con el NAS, acepta notificaciones, o pon EXPO_PUSH_TOKEN.");
    return;
  }
  const isApk = kind === "apk";
  const messages = unique.map((to) => ({
    to,
    title: "NLC",
    body: isApk
      ? "Hay una APK nueva. Ábrela para descargar e instalar."
      : "Hay una versión nueva. Ábrela para actualizar.",
    sound: "default",
    channelId: "ota",
    priority: "high",
    data: isApk ? { apk: true, url: APK_URL } : { ota: true, channel: kind },
  }));
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Expo push HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  console.log(`Push ${isApk ? "APK" : `OTA (${kind})`} enviada a ${unique.length} dispositivo(s).`);
}

function syncGitHubSecret(tokens) {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) {
    console.warn("No hay tokens para guardar en EXPO_PUSH_TOKENS.");
    return;
  }
  const result = spawnSync("gh", ["secret", "set", "EXPO_PUSH_TOKENS"], {
    input: unique.join(","),
    encoding: "utf8",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || "").trim() || `gh secret set exited ${result.status}`);
  }
  console.log(`GitHub secret EXPO_PUSH_TOKENS actualizado (${unique.length}).`);
}

const nasTokens = await tokensFromNas();
const all = [...nasTokens, ...extra];
if (process.argv.includes("--sync-secret")) {
  syncGitHubSecret(all);
  if (process.argv.includes("--sync-only")) process.exit(0);
}
await send(all);
