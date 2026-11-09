import type { AudioPlayer } from "expo-audio";
import { browserBackend, mediaUrl, onBackendChange, remoteState, requestId } from "@/lib/backend/remote";
import { remoteEnabled } from "@/lib/backend/profile";
import { getBrowserMusicVolume } from "./browser-music-volume";
import { EMPTY_MEDIA, type MediaState } from "./session-core";
import type { Track } from "@/lib/nas/types";
export const playbackClientId = typeof window === "undefined" ? "web" : requestId();
let state: MediaState = { ...EMPTY_MEDIA };
let preferredTarget: "phone" | "browser" = "phone";
let active: HTMLMediaElement | null = null; let activeKey = ""; let sequence = 0; let generation = 0; let lastReport = 0;
let refreshing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const musicElements = new Set<HTMLMediaElement>();
function notify() { listeners.forEach(fn => fn()); }
function key(value: MediaState) { return `${value.kind}:${value.videoPath || value.queue[value.index]?.id || ""}:${value.playNonce}`; }
async function prepare(value: MediaState): Promise<HTMLMediaElement> {
 const media = document.createElement(value.kind === "video" ? "video" : "audio"); media.preload = "auto"; media.setAttribute("playsinline", "");
 if (value.kind === "audio") {
  media.volume = getBrowserMusicVolume();
  musicElements.add(media);
 }
 media.src = mediaUrl(value.kind === "video" ? "video" : "track", value.videoPath || value.queue[value.index]?.id || "");
 try {
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { cleanup(); reject(new Error("Formato no compatible. Puedes reproducirlo en el móvil.")); }, 15000); const cleanup = () => { clearTimeout(timer); media.removeEventListener("canplay", ready); media.removeEventListener("error", fail); }; const ready = () => { cleanup(); resolve(); }; const fail = () => { cleanup(); reject(new Error("Formato no compatible. Puedes reproducirlo en el móvil.")); }; media.addEventListener("canplay", ready); media.addEventListener("error", fail); media.load(); });
  media.currentTime = value.currentTime; return media;
 } catch (error) { dispose(media); throw error; }
}
function dispose(media: HTMLMediaElement) { musicElements.delete(media); media.pause(); media.removeAttribute("src"); media.load(); media.remove(); }
function install(media: HTMLMediaElement, value: MediaState) {
 if (active && active !== media) dispose(active); active = media; activeKey = key(value); sequence = 0;
 media.onended = () => { void report(true); };
 media.onerror = () => { state = { ...state, error: "Formato no compatible. Puedes reproducirlo en el móvil." }; notify(); };
}
async function apply(next: MediaState) {
 const version = ++generation; const previousRevision = state.revision;
 if (!next.queue.length && !next.videoPath) next = { ...next, owner: preferredTarget === "phone" ? "phone" : playbackClientId };
 state = next; notify();
 if (next.owner !== playbackClientId || !remoteState.getSnapshot().connected) { active?.pause(); return; }
 if ((!next.queue.length && !next.videoPath)) { if (active) dispose(active); active = null; return; }
 if (activeKey !== key(next)) {
  const prepared = await prepare(next);
  if (version !== generation) { dispose(prepared); return; }
  try {
   if (next.playing) await prepared.play();
  } catch (error) {
   dispose(prepared); throw error;
  }
  install(prepared, next);
 } else if (active) {
  if (next.revision !== previousRevision && Math.abs(active.currentTime - next.currentTime) > 1.5) active.currentTime = next.currentTime;
  if (next.playing && active.paused) await active.play(); else if (!next.playing) active.pause();
 }
}
async function invoke<T>(method: string, args: unknown[] = [], write = true): Promise<T> {
 return browserBackend.invoke<T>(`playback.${method}`, args, { domain: "playback", write, atomic: false });
}
async function refresh() { if (!remoteEnabled) return; return refreshing ??= invoke<MediaState>("state", [state.revision], false).then(next=>apply({...next,queue:next.queue??state.queue})).catch(error => { state = { ...state, error: String(error) }; notify(); }).finally(() => { refreshing = null; }); }
async function report(ended = false) {
 const media = active; if (!media || state.owner !== playbackClientId || !remoteState.getSnapshot().connected) return;
 await invoke("progress", [playbackClientId, state.revision, ++sequence, media.currentTime || 0, Number.isFinite(media.duration) ? media.duration : 0, !media.paused, ended], false).catch(() => {});
}
async function play(queue: Track[], index = 0, owner = preferredTarget === "phone" ? "phone" : playbackClientId) {
 let candidate: HTMLMediaElement | null = null;
 try {
  const next = { ...state, queue, index, kind: "audio" as const, videoPath: null, currentTime: 0, playing: true, owner, playNonce: state.playNonce + 1 };
  if (owner === playbackClientId) { candidate = await prepare(next); await candidate.play(); }
  const reply = await invoke<MediaState>("play", [queue.map(track => track.id), index, owner, state.revision]);
  if (candidate) install(candidate, reply); await apply(reply);
 } catch (error) { candidate && dispose(candidate); state = { ...state, error: String(error) }; notify(); throw error; }
}
async function transfer(owner: "phone" | "browser") {
 preferredTarget = owner;
 if (owner === "phone" && !state.queue.length && !state.videoPath) { state = { ...state, owner: "phone" }; notify(); return; }
 if (owner === "phone") { await apply(await invoke<MediaState>("phone", [state.revision])); return; }
 if (!state.queue.length && !state.videoPath) { state = { ...state, owner: playbackClientId }; notify(); return; }
 const lease = await invoke<{ leaseId: string; state: MediaState }>("prepare", [playbackClientId, requestId()], false);
 let prepared: HTMLMediaElement | null = null;
 try { prepared = await prepare(lease.state); if (lease.state.playing) await prepared.play(); const reply = await invoke<MediaState>("confirm", [playbackClientId, lease.leaseId]); prepared.currentTime = reply.currentTime; install(prepared, reply); await apply(reply); }
 catch (error) { prepared && dispose(prepared); state = { ...state, error: String(error) }; notify(); throw error; }
}
export const mediaSession = {
 getSnapshot: () => state, getPlayer: () => active as unknown as AudioPlayer,
 setMusicVolume(volume: number) {
  for (const media of musicElements) media.volume = volume;
 },
 subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
 play, video: async (path: string, position = 0) => { let candidate: HTMLMediaElement | null = null; const owner = preferredTarget === "phone" ? "phone" : playbackClientId;
  try { if (owner !== "phone") { candidate = await prepare({ ...state, kind: "video", videoPath: path, currentTime: position }); await candidate.play(); } const reply = await invoke<MediaState>("video", [path, position, owner]); if (candidate) install(candidate, reply); await apply(reply); } catch (error) { candidate && dispose(candidate); throw error; }
 },
 control: async (method: string, value?: any) => { if (method === "enqueue") value = { ids: value.tracks.map((track: Track) => track.id), where: value.where }; await apply(await invoke<MediaState>("control", [method, value ?? null, state.revision])); },
 next: async (direction: 1 | -1) => { await apply(await invoke<MediaState>("control", [direction === 1 ? "next" : "prev", null, state.revision])); }, transfer,
};
export const loadMediaSession = refresh;
onBackendChange(domain => { if (["playback", "*"].includes(domain)) void refresh(); });
remoteState.subscribe(() => { if (!remoteState.getSnapshot().connected) active?.pause(); });
if (typeof window !== "undefined" && remoteEnabled) setInterval(() => { if (active && state.owner === playbackClientId) { state = { ...state, currentTime: active.currentTime || 0, duration: Number.isFinite(active.duration) ? active.duration : 0, playing: !active.paused }; notify(); if (Date.now() - lastReport > 1500) { lastReport = Date.now(); void report(); } } }, 250);
export function attachBrowserVideo(container: HTMLElement) { if (active?.tagName === "VIDEO") { active.controls = true; active.style.width = "100%"; active.style.height = "100%"; container.appendChild(active); } }
