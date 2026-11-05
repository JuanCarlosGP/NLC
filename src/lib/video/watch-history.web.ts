import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend } from "@/lib/backend/remote";
import * as local from "./watch-history.impl";
export * from "./watch-history.impl";
let memory: local.VideoWatchEntry[] = [];
export const peekWatchHistory = () => remoteEnabled ? memory : local.peekWatchHistory();
export const peekLastWatch = () => remoteEnabled ? memory[0] || null : local.peekLastWatch();
export const peekWatchForPath = (path: string) => remoteEnabled ? memory.find(row => row.path === path) || null : local.peekWatchForPath(path);
export async function loadWatchHistory() { if (!remoteEnabled) return local.loadWatchHistory(); return memory = await browserBackend.invoke("videoHistory.reloadWatchHistory", [], { domain: "videoHistory" }); }
export const reloadWatchHistory = loadWatchHistory;
export async function loadLastWatch() { return (await loadWatchHistory())[0] || null; }
export async function markWatching(entry: Omit<local.VideoWatchEntry, "watchedAt">) { if (!remoteEnabled) return local.markWatching(entry); const result = await browserBackend.invoke<local.VideoWatchEntry>("videoHistory.markWatching", [entry], { domain: "videoHistory", write: true }); await loadWatchHistory(); return result; }
export async function clearLastWatch(match?: string) { if (!remoteEnabled) return local.clearLastWatch(match); await browserBackend.invoke("videoHistory.clearLastWatch", [match ?? null], { domain: "videoHistory", write: true, key: args => String(args[0] ?? "$collection") }); await loadWatchHistory(); }
// Session progress is reported by the singleton player, never by a page lifecycle.
export function updateWatchProgress(position: number, duration: number) { if (!remoteEnabled) local.updateWatchProgress(position, duration); }
export async function flushWatchProgress(position?: number, duration?: number, path?: string) { if (!remoteEnabled) return local.flushWatchProgress(position, duration, path); }
