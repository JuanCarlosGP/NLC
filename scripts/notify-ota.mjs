#!/usr/bin/env node
/**
 * After `eas update`, ping every APK that registered its Expo push token
 * (Music/snd-push-tokens.json on the NAS, plus EXPO_PUSH_TOKEN).
 *
 * Android needs FCM V1 credentials on the EAS project once:
 *   eas credentials  → Android → production → FCM V1
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const kind = process.argv[2] === "preview" ? "preview" : process.argv[2] === "apk" ? "apk" : "production";
const APK_URL = "https://github.com/JuanCarlosGP/SND/releases/latest";
const host = process.env.SND_NAS_HOST || "192.168.1.106";
const port = process.env.SND_NAS_PORT || "5005";
const user = process.env.SND_NAS_USER || "Viewer";
const password = process.env.SND_NAS_PASSWORD || process.env.SND_NAS_PASS || "";
const share = process.env.SND_NAS_SHARE || "/Music/snd-push-tokens.json";
const extra = (process.env.EXPO_PUSH_TOKEN || process.env.EXPO_PUSH_TOKENS || "")
  .split(/[,\s]+/)
  .map((item) => item.trim())
  .filter(Boolean);

function toWebDavPath(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.replace(/^\/volume\d+(?=\/|$)/i, "") || "/";
}

function encodeDavPath(path) {
  return toWebDavPath(path)
    .split("/")
    .map((part) => (part ? encodeURIComponent(part) : ""))
    .join("/");
}

function authHeader() {
  if (!user) return "";
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

async function tokensFromNas() {
  if (!password) {
    console.warn("Sin SND_NAS_PASSWORD: no se leen tokens del NAS.");
    return [];
  }
  const url = `http://${host}:${port}${encodeDavPath(share)}`;
  const response = await fetch(url, { headers: { Authorization: authHeader() } });
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`NAS HTTP ${response.status} al leer ${share}`);
  }
  const parsed = await response.json();
  const tokens = Array.isArray(parsed?.tokens) ? parsed.tokens : [];
  return tokens.map((item) => (typeof item === "string" ? item : item?.token)).filter(Boolean);
}

async function send(tokens) {
  const unique = [...new Set(tokens)];
  if (!unique.length) {
    console.warn("No hay tokens. Abre la APK una vez (con el NAS) para registrar el teléfono.");
    return;
  }
  const isApk = kind === "apk";
  const messages = unique.map((to) => ({
    to,
    title: "SND",
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

const nasTokens = await tokensFromNas();
await send([...nasTokens, ...extra]);
