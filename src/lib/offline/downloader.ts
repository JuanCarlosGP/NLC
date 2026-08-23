import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import {
  clearLocalCopies,
  clearLocalCopy,
  getDownloadMeta,
  getOfflineSummary,
  listPendingDownloads,
  markDownloading,
  markError,
  markReady,
  notifyCatalog,
} from "@/lib/db/catalog";
import type { OfflineKind } from "@/lib/db/catalog";
import type { PlayableSource } from "@/lib/nas/types";

export type OfflineProgress = {
  running: boolean;
  paused: boolean;
  currentTitle: string | null;
  done: number;
  total: number;
  bytes: number;
  supported: boolean;
};

type Resolver = (trackId: string) => Promise<PlayableSource>;

const listeners = new Set<() => void>();
let resolver: Resolver | null = null;
let running = false;
let paused = false;
let currentTitle: string | null = null;
let done = 0;
let total = 0;
let bytes = 0;

function fileKey(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const tail = id.split("/").pop()?.replace(/[^a-zA-Z0-9._-]/g, "") || "audio";
  return `${hash.toString(16)}-${tail.slice(0, 48)}`;
}

function offlineDir(): string | null {
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  return `${root}offline/`;
}

export function offlineSupported(): boolean {
  return Platform.OS !== "web" && Boolean(FileSystem.documentDirectory);
}

export function getOfflineProgress(): OfflineProgress {
  return {
    running,
    paused,
    currentTitle,
    done,
    total,
    bytes,
    supported: offlineSupported(),
  };
}

export function subscribeOfflineProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function setOfflineResolver(next: Resolver | null): void {
  resolver = next;
}

export function pauseOfflineSync(): void {
  paused = true;
  emit();
}

export async function refreshOfflineTotals(): Promise<void> {
  const summary = await getOfflineSummary();
  done = summary.ready;
  total = summary.total;
  bytes = summary.bytes;
  emit();
}

export async function clearOfflineFiles(kind?: OfflineKind): Promise<void> {
  if (kind === "video") return;
  paused = true;
  running = false;
  const uris = await clearLocalCopies(kind);
  if (offlineSupported()) {
    await Promise.all(
      uris.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)),
    );
  }
  currentTitle = null;
  await refreshOfflineTotals();
}

async function ensureDir(): Promise<string | null> {
  const dir = offlineDir();
  if (!dir) return null;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export function formatOfflineBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function downloadOne(trackId: string, title: string, nasBytes: number | null): Promise<void> {
  if (!resolver || !offlineSupported()) return;
  const dir = await ensureDir();
  if (!dir) return;
  const dest = `${dir}${fileKey(trackId)}`;
  const existing = await FileSystem.getInfoAsync(dest);
  const size = existing.exists && !existing.isDirectory ? (existing.size ?? 0) : 0;
  if (size > 0 && (!nasBytes || size === nasBytes)) {
    await markReady(trackId, dest, size);
    return;
  }
  if (existing.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
  }
  await markDownloading(trackId);
  currentTitle = title;
  emit();
  const source = await resolver(trackId);
  const uri = typeof source === "string" ? source : source.uri;
  const headers = typeof source === "string" ? undefined : source.headers;
  const result = await FileSystem.downloadAsync(uri, dest, headers ? { headers } : undefined);
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new Error(`HTTP ${result.status}`);
  }
  const info = await FileSystem.getInfoAsync(dest);
  await markReady(trackId, dest, info.exists && !info.isDirectory ? (info.size ?? 0) : 0);
}

export async function removeOfflineFile(trackId: string): Promise<void> {
  const uri = await clearLocalCopy(trackId);
  if (uri && offlineSupported()) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
  await refreshOfflineTotals();
}

export async function startOfflineSync(includeSkipped = false, kind?: OfflineKind): Promise<void> {
  if (kind === "video") return;
  if (!offlineSupported() || !resolver || running || paused) {
    await refreshOfflineTotals();
    return;
  }
  running = true;
  paused = false;
  emit();
  try {
    const pending = await listPendingDownloads(includeSkipped, kind);
    await refreshOfflineTotals();
    for (const item of pending) {
      if (paused) break;
      try {
        await downloadOne(item.id, item.title, item.nasBytes);
      } catch {
        await markError(item.id);
      }
      await refreshOfflineTotals();
    }
  } finally {
    running = false;
    currentTitle = null;
    await refreshOfflineTotals();
    notifyCatalog();
  }
}

export function requestOfflineSync(): void {
  if (!offlineSupported() || paused) return;
  void startOfflineSync();
}

export function resumeOfflineSync(kind?: OfflineKind): void {
  if (kind === "video") return;
  paused = false;
  emit();
  if (!offlineSupported()) return;
  void startOfflineSync(true, kind);
}

export async function downloadTrackIds(ids: string[]): Promise<void> {
  if (!offlineSupported() || !resolver || !ids.length) return;
  paused = false;
  while (running) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  running = true;
  emit();
  try {
    const items = await getDownloadMeta(ids);
    for (const item of items) {
      if (paused) break;
      if (item.offlineStatus === "ready") continue;
      try {
        await downloadOne(item.id, item.title, item.nasBytes);
      } catch {
        await markError(item.id);
      }
      await refreshOfflineTotals();
    }
  } finally {
    running = false;
    currentTitle = null;
    await refreshOfflineTotals();
    notifyCatalog();
  }
}
