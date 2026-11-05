import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend, onBackendChange } from "@/lib/backend/remote";
import * as local from "./downloader.impl";
import type { OfflineKind } from "@/lib/db/catalog";
export * from "./downloader.impl";
let state: local.OfflineProgress = { running: false, paused: false, currentTitle: null, done: 0, total: 0, bytes: 0, supported: true };
const listeners = new Set<() => void>();
async function call(method: string, args: unknown[] = []) { const next = await browserBackend.invoke<local.OfflineProgress>(`offline.${method}`, args, { domain: "offline", write: !["state", "start", "pause"].includes(method), atomic: false }); state = next; listeners.forEach(fn => fn()); }
export const offlineSupported = () => remoteEnabled || local.offlineSupported();
export const getOfflineProgress = () => remoteEnabled ? state : local.getOfflineProgress();
export function subscribeOfflineProgress(fn: () => void) { if (!remoteEnabled) return local.subscribeOfflineProgress(fn); listeners.add(fn); return () => { listeners.delete(fn); }; }
export const setOfflineResolver = remoteEnabled ? () => {} : local.setOfflineResolver;
export async function refreshOfflineTotals() { if (!remoteEnabled) return local.refreshOfflineTotals(); await call("state"); }
export async function clearOfflineFiles(kind?: OfflineKind) { if (!remoteEnabled) return local.clearOfflineFiles(kind); await call("clear", [kind ?? null]); }
export async function removeOfflineFile(id: string) { if (!remoteEnabled) return local.removeOfflineFile(id); await call("remove", [id]); }
export function pauseOfflineSync() { if (!remoteEnabled) return local.pauseOfflineSync(); void call("pause"); }
export async function startOfflineSync(includeSkipped = false, kind?: OfflineKind) { if (!remoteEnabled) return local.startOfflineSync(includeSkipped, kind); await call("start", [includeSkipped, kind ?? null]); }
export function resumeOfflineSync(kind?: OfflineKind) { if (!remoteEnabled) return local.resumeOfflineSync(kind); void startOfflineSync(true, kind); }
export function requestOfflineSync() { if (!remoteEnabled) local.requestOfflineSync(); }
export async function downloadTrackIds(ids: string[]) { if (!remoteEnabled) return local.downloadTrackIds(ids); await call("tracks", [ids]); }
onBackendChange(domain => { if (remoteEnabled && ["offline", "*"].includes(domain)) void call("state").catch(() => {}); });
