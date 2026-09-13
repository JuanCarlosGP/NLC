import { pairToDesktop } from "nlc-lan-bridge";
import { t } from "@/lib/i18n/runtime";
import { BRIDGE_PORT, loadOrCreateDeviceId } from "@/lib/bridge/session";

export function pairHttpUrl(host: string, port: number): string {
  const name = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${name}:${port}/pair`;
}

export async function pairWithDesktop(
  host: string,
  port: number,
  token: string,
  phoneLanIp: string,
): Promise<void> {
  const deviceId = await loadOrCreateDeviceId();
  const url = pairHttpUrl(host, port);
  const jsonBody = JSON.stringify({
    phoneLanIp,
    bridgePort: BRIDGE_PORT,
    deviceId,
  });
  try {
    await pairToDesktop(host, port, token, jsonBody);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    if (detail.includes("0.1.9")) throw err;
    throw new Error(t("desktop.pairNetwork", { url: detail ? `${url} (${detail})` : url }));
  }
}

export async function notifyDesktopUnlink(host: string, port = 7420, token?: string | null): Promise<void> {
  if (!host) return;
  const name = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    await fetch(`http://${name}:${port}/unlink`, {
      method: "POST",
      headers,
      signal: controller.signal,
    });
  } catch {
    // Best-effort in case desktop is unreachable
  } finally {
    clearTimeout(timer);
  }
}
