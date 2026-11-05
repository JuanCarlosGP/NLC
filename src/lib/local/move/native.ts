import * as FileSystem from "expo-file-system/legacy";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type { NasSettings, ServiceId } from "@/lib/settings/storage";
export type MoveMetadata = { fingerprint: string; target: NasSettings };
export type MoveSummary = {
  id: string;
  state: string;
  nonce: string;
  metadata: MoveMetadata;
  files: number;
  bytes: number;
  verified: number;
  remaining: number;
  retained: number;
};
export type MovedFile = {
  key: string;
  service: ServiceId;
  source: string;
  sourceKey: string;
  relative: string;
  uri: string;
  path: string;
  bytes: number;
  refs: string[];
};
export type MoveProgress = {
  id: string;
  phase: string;
  bytes: number;
  files: number;
};
type Native = {
  pendingLocalMoves(): Promise<string>;
  prepareLocalMove(id: string, input: string): Promise<string>;
  copyLocalMove(id: string): Promise<string>;
  verifyLocalMove(id: string): Promise<void>;
  finishLocalMove(id: string, input: string): Promise<string>;
  abortLocalMove(id: string): Promise<string>;
  keepLocalMoveOriginals(id: string): Promise<string>;
  cancelLocalMove(id: string): void;
  addListener(
    event: "onLocalMoveProgress",
    fn: (event: MoveProgress) => void,
  ): { remove(): void };
};
export function moveNative() {
  const mod =
    Platform.OS === "android"
      ? requireOptionalNativeModule<Native>("NlcLanBridge")
      : null;
  if (!mod?.prepareLocalMove) throw new Error("nativeUpdate");
  return mod;
}
export async function withMoveJson<T>(
  name: string,
  value: unknown,
  task: (uri: string) => Promise<T>,
) {
  if (!FileSystem.cacheDirectory) throw new Error("storage");
  const uri = `${FileSystem.cacheDirectory}move-${name}.json`,
    raw = JSON.stringify(value);
  if (raw.length > 32 * 1024 * 1024) throw new Error("size");
  try {
    await FileSystem.writeAsStringAsync(uri, raw);
    return await task(uri);
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
export const pendingMoves = async (): Promise<MoveSummary[]> =>
  JSON.parse(await moveNative().pendingLocalMoves());
export async function readMoveFiles(uri: string): Promise<MovedFile[]> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || info.size > 32 * 1024 * 1024)
    throw new Error("size");
  return JSON.parse(await FileSystem.readAsStringAsync(uri)).files;
}
