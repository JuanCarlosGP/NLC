import AsyncStorage from "@react-native-async-storage/async-storage";
import { bridgePort, getBridgeLink, isBridgeRunning, isWebTuiRunning, startLanBridge, startWebTuiNative, stopWebTuiNative } from "nlc-lan-bridge";
import { BRIDGE_PORT, loadBridgeToken, saveBridgeToken } from "@/lib/bridge/session";

const ENABLED_KEY = "nlc.webTui.enabled";

/** Page served by the phone. Same port as the local ttyd session. */
export const WEB_TUI_PORT = 7681;

export async function loadWebTuiEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(ENABLED_KEY);
  return raw === "1";
}

export async function saveWebTuiEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
}

export function webTuiUrl(lanAddress: string): string {
  return `http://${lanAddress}:${WEB_TUI_PORT}`;
}

function freshToken(): string {
  let out = "";
  for (let i = 0; i < 32; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

export async function startPhoneWebTui(): Promise<void> {
  let token = (await loadBridgeToken()) || getBridgeLink()?.token || "";
  if (!token) {
    token = freshToken();
    await saveBridgeToken(token);
  }
  let port = BRIDGE_PORT;
  if (!isBridgeRunning()) {
    try {
      const started = await startLanBridge(BRIDGE_PORT, token, false);
      port = started.port || port;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/EADDRINUSE|already in use/i.test(message)) throw new Error("busy");
      throw error;
    }
  } else {
    port = bridgePort() || port;
  }
  try {
    await startWebTuiNative(token, port);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("web tui start failed", message);
    throw error;
  }
}

export async function stopPhoneWebTui(): Promise<void> {
  await stopWebTuiNative();
}
