import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
export type ArchiveFile = {
  path: string;
  uri: string;
  bytes?: number;
  headers?: Record<string, string>;
};
export type ArchiveStage = {
  id: string;
  metadata: string;
  files: Record<string, { uri: string; bytes: number }>;
  bytes: number;
};
export type ArchiveProgress = { bytes: number; files: number; job?: string };
export type ArchiveAuthorizer = (
  uri: string,
  retry: boolean,
  signal?: AbortSignal,
) => Promise<Record<string, string>>;
type ArchiveAuthRequest = {
  id: string;
  job: string;
  uri: string;
  retry: boolean;
};
type Native = {
  pendingServiceCommits?(): Promise<string>;
  finishServiceCommit?(job:string,keep:boolean): Promise<void>;
  resolveServiceArchiveAuth(id: string, headers: string): void;
  listServiceFolder(uri: string): Promise<string>;
  exportServiceArchive(plan: string): Promise<string>;
  prepareServiceArchive(uri: string, job: string): Promise<string>;
  commitServiceFiles(
    id: string,
    destination: string,
    job: string,
  ): Promise<string>;
  discardServiceStage(id: string): Promise<void>;
  cancelServiceArchive(job: string): void;
  addListener(
    name: "onServiceArchiveProgress",
    fn: (event: ArchiveProgress) => void,
  ): { remove(): void };
  addListener(
    name: "onServiceArchiveAuth",
    fn: (event: ArchiveAuthRequest) => void,
  ): { remove(): void };
};
function native(): Native {
  const mod =
    Platform.OS === "android"
      ? requireOptionalNativeModule<Native>("NlcLanBridge")
      : null;
  if (!mod?.exportServiceArchive) throw new Error("nativeUpdate");
  return mod;
}
export const listArchiveFolder = async (uri: string): Promise<ArchiveFile[]> =>
  JSON.parse(await native().listServiceFolder(uri));
export async function exportArchive(
  destination: string,
  metadata: unknown,
  files: ArchiveFile[],
  job: string,
  authorize?: ArchiveAuthorizer,
): Promise<ArchiveProgress> {
  const mod = native();
  if (!FileSystem.cacheDirectory) throw new Error("storage");
  const abort = new AbortController();
  const listener = authorize
    ? mod.addListener("onServiceArchiveAuth", (request) => {
        if (request.job !== job) return;
        void (async () => {
          let headers: Record<string, string> = {};
          try {
            headers = await authorize(request.uri, request.retry, abort.signal);
          } catch {}
          try {
            mod.resolveServiceArchiveAuth(request.id, JSON.stringify(headers));
          } catch {}
        })();
      })
    : null;
  const metadataUri = `${FileSystem.cacheDirectory}nlc-service-${encodeURIComponent(job)}.json`;
  try {
    const raw = JSON.stringify(metadata);
    if (raw.length > 32 * 1024 * 1024) throw new Error("size");
    await FileSystem.writeAsStringAsync(metadataUri, raw);
    return JSON.parse(
      await mod.exportServiceArchive(
        JSON.stringify({
          destination,
          metadataUri,
          files,
          job,
          authorize: !!authorize,
        }),
      ),
    );
  } finally {
    abort.abort();
    listener?.remove();
    await FileSystem.deleteAsync(metadataUri, { idempotent: true }).catch(
      () => {},
    );
  }
}
export async function prepareArchive(
  uri: string,
  job: string,
): Promise<ArchiveStage> {
  const mod = native();
  const result = JSON.parse(await mod.prepareServiceArchive(uri, job)) as Omit<
    ArchiveStage,
    "metadata"
  > & { metadataUri: string };
  try {
    const metadata = await FileSystem.readAsStringAsync(result.metadataUri);
    return { ...result, metadata };
  } catch (error) {
    await mod.discardServiceStage(result.id).catch(() => {});
    throw error;
  }
}
export const commitArchiveFiles = async (
  stage: ArchiveStage,
  destination: string,
  job: string,
): Promise<{
  root: string;
  name: string;
  files: Record<string, string>;
  paths?: Record<string, string>;
}> => JSON.parse(await native().commitServiceFiles(stage.id, destination, job));
export const discardArchive = async (stage: ArchiveStage) =>
  native().discardServiceStage(stage.id);
export function archiveProgress(fn: (event: ArchiveProgress) => void) {
  try {
    return native().addListener("onServiceArchiveProgress", fn);
  } catch {
    return { remove() {} };
  }
}
export function cancelArchive(job: string) {
  try {
    native().cancelServiceArchive(job);
  } catch {}
}

export function assertArchiveAvailable() {
  native();
}

export async function pendingArchiveCommits(): Promise<string[]> {return JSON.parse(await native().pendingServiceCommits?.() ?? "[]");}
export async function finishArchiveCommit(job:string,keep:boolean) {await native().finishServiceCommit?.(job,keep);}
