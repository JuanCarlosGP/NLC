import { getLanAddress } from "nlc-lan-bridge";
import { BRIDGE_PORT, loadOrCreateDeviceId } from "@/lib/bridge/session";

export async function pairWithDesktop(host: string, port: number, token: string): Promise<void> {
  const deviceId = await loadOrCreateDeviceId();
  const lanAddress = getLanAddress();
  const url = `http://${host}:${port}/pair`;
  const response = await fetch(url, {
    method: "POST",
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
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `pair ${response.status}`);
  }
}
