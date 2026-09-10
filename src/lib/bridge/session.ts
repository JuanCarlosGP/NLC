import { randomUUID } from "expo-crypto";
import { getSecret, setSecret, deleteSecret } from "@/lib/settings/secret-store";

const TOKEN_KEY = "nlc.bridge.token";
const DEVICE_KEY = "nlc.bridge.deviceId";
const DESKTOP_KEY = "nlc.bridge.desktopHost";

export const BRIDGE_PORT = 7421;

export async function loadBridgeToken(): Promise<string | null> {
  return getSecret(TOKEN_KEY);
}

export async function saveBridgeToken(token: string): Promise<void> {
  await setSecret(TOKEN_KEY, token);
  notifyBridgeSession();
}

export async function loadDesktopHost(): Promise<string | null> {
  return getSecret(DESKTOP_KEY);
}

export async function saveDesktopHost(host: string): Promise<void> {
  await setSecret(DESKTOP_KEY, host);
  notifyBridgeSession();
}

export async function loadOrCreateDeviceId(): Promise<string> {
  const existing = await getSecret(DEVICE_KEY);
  if (existing) return existing;
  const id = randomUUID();
  await setSecret(DEVICE_KEY, id);
  return id;
}

const sessionListeners = new Set<() => void>();

export function subscribeBridgeSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function notifyBridgeSession() {
  for (const listener of sessionListeners) listener();
}

export async function clearBridgeSession(): Promise<void> {
  await Promise.all([deleteSecret(TOKEN_KEY), deleteSecret(DESKTOP_KEY)]);
  notifyBridgeSession();
}

export function parsePairQr(raw: string): { host: string; port: number; token: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const httpish = trimmed.replace(/^nlc:\/\//i, "http://");
    const url = new URL(httpish);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token) return null;
    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    if (!url.hostname || !Number.isFinite(port) || port <= 0) return null;
    return { host: url.hostname, port, token };
  } catch {
    return null;
  }
}
