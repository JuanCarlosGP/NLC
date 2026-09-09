import { getLanAddress, pairToDesktop } from "nlc-lan-bridge";
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
  const jsonBody = JSON.stringify({
    phoneLanIp: lanAddress,
    bridgePort: BRIDGE_PORT,
    deviceId,
  });
  try {
    await pairToDesktop(host, port, token, jsonBody);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    throw new Error(t("desktop.pairNetwork", { url: detail ? `${url} (${detail})` : url }));
  }
}
