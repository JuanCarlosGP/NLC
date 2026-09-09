import { getLanAddress } from "nlc-lan-bridge";
import { t } from "@/lib/i18n/runtime";
import { BRIDGE_PORT, loadOrCreateDeviceId } from "@/lib/bridge/session";

export function pairHttpUrl(host: string, port: number): string {
  const name = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${name}:${port}/pair`;
}

export async function pairWithDesktop(host: string, port: number, token: string): Promise<void> {
  const deviceId = await loadOrCreateDeviceId();
  const lanAddress = getLanAddress();
  const url = pairHttpUrl(host, port);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneLanIp: lanAddress,
        bridgePort: BRIDGE_PORT,
        deviceId,
      }),
    });
  } catch {
    throw new Error(t("desktop.pairNetwork", { url }));
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `pair ${response.status}`);
  }
}
