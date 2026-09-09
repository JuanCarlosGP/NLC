import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type BridgeStartResult = {
  port: number;
  lanAddress: string;
};

export type BridgeRequestEvent = {
  id: string;
  method: string;
  path: string;
  query: string;
  range?: string | null;
};

type NativeBridge = {
  start(port: number, token: string): Promise<BridgeStartResult>;
  stop(): Promise<void>;
  getLanAddress(): string;
  pairToDesktop(host: string, port: number, token: string, jsonBody: string): Promise<string>;
  resolveJson(id: string, status: number, body: string): void;
  resolveStream(id: string, uri: string, headersJson: string): void;
  fail(id: string, status: number, message: string): void;
  addListener(event: "onBridgeRequest", listener: (event: BridgeRequestEvent) => void): { remove(): void };
};

let native: NativeBridge | null = null;

function loadNative(): NativeBridge | null {
  if (Platform.OS !== "android") return null;
  if (native) return native;
  try {
    native = requireNativeModule("NlcLanBridge") as NativeBridge;
    return native;
  } catch {
    return null;
  }
}

export const isLanBridgeAvailable = Platform.OS === "android" && loadNative() != null;

export async function startLanBridge(port: number, token: string): Promise<BridgeStartResult> {
  const mod = loadNative();
  if (!mod) throw new Error("Lan bridge native module is missing");
  return mod.start(port, token);
}

export async function stopLanBridge(): Promise<void> {
  await loadNative()?.stop();
}

export async function pairToDesktop(host: string, port: number, token: string, jsonBody: string): Promise<string> {
  const mod = loadNative();
  if (!mod) throw new Error("Lan bridge native module is missing");
  return mod.pairToDesktop(host, port, token, jsonBody);
}

export function resolveBridgeJson(id: string, status: number, body: unknown): void {
  loadNative()?.resolveJson(id, status, typeof body === "string" ? body : JSON.stringify(body));
}

export function resolveBridgeStream(id: string, uri: string, headers: Record<string, string> = {}): void {
  loadNative()?.resolveStream(id, uri, JSON.stringify(headers));
}

export function failBridgeRequest(id: string, status: number, message: string): void {
  loadNative()?.fail(id, status, message);
}

export function addBridgeRequestListener(listener: (event: BridgeRequestEvent) => void): { remove(): void } {
  const mod = loadNative();
  if (!mod?.addListener) return { remove() {} };
  return mod.addListener("onBridgeRequest", listener);
}
