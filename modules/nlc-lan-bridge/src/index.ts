import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type BridgeLinkState = {
  token?: string;
  desktopHost?: string;
  tuiSeen?: boolean;
};

export type BridgeStartResult = {
  port: number;
  lanAddress: string;
  running?: boolean;
};

export type BridgeClaimedEvent = {
  token: string;
  desktopHost?: string;
};

export type BridgeRequestEvent = {
  id: string;
  method: string;
  path: string;
  query: string;
  range?: string | null;
};

type NativeBridge = {
  start(port: number, token: string, resume: boolean): Promise<BridgeStartResult>;
  stop(): Promise<void>;
  getLanAddress(): string;
  isUnlinked(): boolean;
  linkState(): BridgeLinkState;
  pairToDesktop(host: string, port: number, token: string, jsonBody: string): Promise<string>;
  resolveJson(id: string, status: number, body: string): void;
  resolveStream(id: string, uri: string, headersJson: string): void;
  fail(id: string, status: number, message: string): void;
  addListener(
    event: "onBridgeRequest" | "onBridgeUnlinked" | "onBridgeClaimed",
    listener: ((event: BridgeRequestEvent) => void) | ((event: BridgeClaimedEvent) => void) | (() => void),
  ): { remove(): void };
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

export async function startLanBridge(port: number, token: string, resume = false): Promise<BridgeStartResult> {
  const mod = loadNative();
  if (!mod) throw new Error("Lan bridge native module is missing");
  return mod.start(port, token, resume);
}

export async function stopLanBridge(): Promise<void> {
  await loadNative()?.stop();
}

export function isBridgeUnlinked(): boolean {
  const mod = loadNative();
  if (!mod || typeof mod.isUnlinked !== "function") return false;
  return mod.isUnlinked();
}

export function getBridgeLink(): BridgeLinkState | null {
  const mod = loadNative();
  if (!mod || typeof mod.linkState !== "function") return null;
  return mod.linkState();
}

export function getLanAddress(): string {
  const mod = loadNative();
  if (!mod?.getLanAddress) throw new Error("Lan bridge native module is missing");
  return mod.getLanAddress();
}

export async function pairToDesktop(host: string, port: number, token: string, jsonBody: string): Promise<string> {
  const mod = loadNative();
  if (!mod) throw new Error("Lan bridge native module is missing");
  if (typeof mod.pairToDesktop !== "function") {
    throw new Error("This APK cannot pair yet. Install 0.1.9+ from GitHub.");
  }
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

export function addBridgeUnlinkedListener(listener: () => void): { remove(): void } {
  const mod = loadNative();
  if (!mod?.addListener) return { remove() {} };
  return mod.addListener("onBridgeUnlinked", listener);
}

export function addBridgeClaimedListener(listener: (event: BridgeClaimedEvent) => void): { remove(): void } {
  const mod = loadNative();
  if (!mod?.addListener) return { remove() {} };
  return mod.addListener("onBridgeClaimed", listener);
}
