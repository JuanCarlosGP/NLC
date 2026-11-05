import type { Track } from "@/lib/nas/types";
import type { RepeatMode } from "./types";
export type MediaState = { queue: Track[]; index: number; kind: "audio" | "video"; videoPath: string | null; owner: string; playing: boolean; buffering: boolean; currentTime: number; duration: number; shuffle: boolean; repeat: RepeatMode; playNonce: number; revision: number; error: string | null };
export type PreparedMedia = { object: unknown; play(): void | Promise<void>; pause(): void; seek(seconds: number): void | Promise<void>; dispose(): void; committed?(): void };
export type MediaDriver = { prepare(state: MediaState, report: (position: number, duration: number, playing: boolean, ended?: boolean) => void): Promise<PreparedMedia>; save(state: MediaState): Promise<void>; changed(state: MediaState): void; now?(): number };
export const EMPTY_MEDIA: MediaState = { queue: [], index: 0, kind: "audio", videoPath: null, owner: "phone", playing: false, buffering: false, currentTime: 0, duration: 0, shuffle: false, repeat: "off", playNonce: 0, revision: 0, error: null };
export function createMediaSession(driver: MediaDriver) {
 let state = { ...EMPTY_MEDIA }; let active: PreparedMedia | null = null; let queue: Promise<unknown> = Promise.resolve();
 let lastBrowserReport = 0; let preparing = 0;
 let progressSeq = -1; let ending = false; const leases = new Map<string, { revision: number; owner: string; expires: number; next?: MediaState }>();
 const listeners = new Set<() => void>(); const now = driver.now ?? Date.now;
 let persisted = 0;
 function update(patch: Partial<MediaState>, structural = false, saved = false) { state = { ...state, ...patch, revision: state.revision + (structural ? 1 : 0) }; listeners.forEach(fn => fn()); driver.changed(state); if (structural || now() - persisted > 3000) { persisted = now(); if (!saved) void driver.save({ ...state, playing: false }).catch(() => {}); } }
 function serialize<T>(task: () => Promise<T>) { const result = queue.then(task); queue = result.catch(() => {}); return result; }
 function assertRevision(revision?: number) { if (revision !== undefined && revision !== state.revision) throw new Error("media_session_changed"); }
 function report(position: number, duration: number, playing: boolean, ended = false) {
  if (state.owner !== "phone") return;
  update({ currentTime: Math.max(0, position), duration: Math.max(0, duration), playing });
  if (ended && !ending) { ending = true; void next(1).finally(() => { ending = false; }); }
 }
 async function activate(next: MediaState) {
  let prepared: PreparedMedia | null = null; preparing++;
  try {
   if (next.owner === "phone" && (next.queue.length || next.videoPath)) { prepared = await driver.prepare(next, (...args) => { if (prepared && active === prepared) report(...args); });
    if (next.owner !== state.owner && next.playNonce === state.playNonce) next = { ...next, currentTime: Math.min(state.duration || Number.MAX_SAFE_INTEGER, state.currentTime + (state.playing && state.owner !== "phone" ? Math.max(0, now() - lastBrowserReport) / 1000 : 0)), playing: state.playing };
    await prepared.seek(next.currentTime); if (next.playing) await prepared.play(); }
   // Do not interrupt the previous destination until preparation and playback have succeeded.
   await driver.save({ ...next, playing: false });
   active?.pause(); const previous = active; active = prepared; update({ ...next, error: null }, true, true); previous?.dispose(); prepared?.committed?.(); lastBrowserReport = now(); progressSeq = -1; leases.clear();
  } catch (error) { prepared?.dispose(); throw error; } finally { preparing--; }
 }
 function play(tracks: Track[], index = 0, owner = "phone", revision?: number) { return serialize(async () => { assertRevision(revision); if (!tracks.length || tracks.length > 10000 || !Number.isInteger(index) || index < 0 || index >= tracks.length) throw new Error("invalid_queue"); let ordered = tracks.slice(); if (state.shuffle) { const first = ordered[index]; ordered = ordered.filter((_, i) => i !== index).sort(() => Math.random() - 0.5); ordered.unshift(first); index = 0; } await activate({ ...state, queue: ordered, index, owner, kind: "audio", videoPath: null, currentTime: 0, duration: 0, playing: true, playNonce: state.playNonce + 1 }); }); }
 function video(path: string, position = 0, owner = "phone") { return serialize(() => activate({ ...state, kind: "video", videoPath: path, queue: [], index: 0, owner, currentTime: Math.max(0, position), duration: 0, playing: true, playNonce: state.playNonce + 1 })); }
 function next(direction: 1 | -1, revision?: number) { return serialize(async () => {
  assertRevision(revision);
  if (state.kind !== "audio" || !state.queue.length) { active?.pause(); update({ playing: false }, true); return; }
  let index = state.index + direction;
  if (direction === -1 && state.currentTime > 3) index = state.index;
  if (state.repeat === "one" && direction === 1) index = state.index;
  if (index >= state.queue.length) { if (state.repeat !== "all") { active?.pause(); update({ playing: false }, true); return; } index = 0; }
  if (index < 0) index = state.repeat === "all" ? state.queue.length - 1 : 0;
  await activate({ ...state, index, currentTime: 0, playing: true, playNonce: state.playNonce + 1 });
 }); }
 async function control(method: string, value?: any, revision?: number) { return serialize(async () => {
  assertRevision(revision);
  if (method === "pause") { active?.pause(); update({ playing: false }, true); }
  else if (method === "toggle") { if (state.owner === "phone" && !active && (state.queue.length || state.videoPath)) await activate({ ...state, playing: true }); else { const playing=!state.playing; if (!playing) active?.pause(); else await active?.play(); update({ playing }, true); } }
  else if (method === "seek") { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("invalid_position"); await active?.seek(value); update({ currentTime: value }, true); }
  else if (method === "shuffle") update({ shuffle: !state.shuffle }, true);
  else if (method === "repeat") update({ repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off" }, true);
  else if (method === "enqueue") { const { tracks, where } = value; if (!Array.isArray(tracks) || state.queue.length + tracks.length > 10000) throw new Error("invalid_queue"); update({ queue: where === "next" ? [...state.queue.slice(0, state.index + 1), ...tracks, ...state.queue.slice(state.index + 1)] : [...state.queue, ...tracks] }, true); }
  else if (method === "remove") { if(!state.queue.some(track=>track.id===value))return; const previous = state.queue[state.index]; const queue = state.queue.filter(track => track.id !== value); const index = Math.max(0, queue.findIndex(track => track.id === previous?.id)); if (!queue.length) { active?.pause(); active?.dispose(); active = null; update({ queue, index: 0, playing: false }, true); } else if (previous?.id === value) await activate({ ...state, queue, index, currentTime: 0 }); else update({ queue, index }, true); }
  else throw new Error("unknown_media_control");
 }); }
 function prepareTransfer(clientId: string, leaseId: string) { if (!/^[a-zA-Z0-9_-]{16,80}$/.test(clientId) || !/^[a-zA-Z0-9_-]{16,80}$/.test(leaseId)) throw new Error("invalid_client"); for(const [id,lease] of leases)if(lease.expires<now())leases.delete(id);if(leases.size>=32)leases.delete(leases.keys().next().value!); leases.set(leaseId, { revision: state.revision, owner: clientId, expires: now() + 20000 }); return { leaseId, state }; }
 function prepareSelection(clientId:string,leaseId:string,selection:{queue?:Track[];index?:number;videoPath?:string;position?:number}) {
  prepareTransfer(clientId,leaseId);const next:MediaState={...state,owner:clientId,kind:selection.videoPath?"video":"audio",videoPath:selection.videoPath||null,queue:selection.videoPath?[]:selection.queue||[],index:selection.index||0,currentTime:selection.position||0,duration:0,playing:true,playNonce:state.playNonce+1};
  leases.get(leaseId)!.next=next;return {leaseId,state:next};
 }
 function confirmTransfer(clientId: string, leaseId: string) { return serialize(async () => {
  const lease = leases.get(leaseId); leases.delete(leaseId);
  if (!lease || lease.owner !== clientId || lease.expires < now() || lease.revision !== state.revision) throw new Error("media_transfer_expired");
  await driver.save({ ...state, ...lease.next, owner: clientId, playing: false });
  active?.pause(); active?.dispose(); active = null; progressSeq = -1; lastBrowserReport = now(); update(lease.next || { owner: clientId }, true, true); leases.clear(); return state;
 }); }
 function toPhone(revision?: number) { return serialize(async () => { assertRevision(revision); await activate({ ...state, owner: "phone" }); }); }
 function reportBrowser(clientId: string, revision: number, sequence: number, position: number, duration: number, playing: boolean, ended = false) {
  if (state.owner !== clientId || state.revision !== revision || sequence <= progressSeq || ![position, duration].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) return false;
  lastBrowserReport = now(); progressSeq = sequence; update({ currentTime: position, duration, playing }); if (ended) void next(1); return true;
 }
 function expireBrowser() { if (!preparing && state.owner !== "phone" && state.playing && now() - lastBrowserReport > 12000) update({ playing: false }, true); }
 function remapTrack(before:string,after:Track,reload=false) {return serialize(async()=>{
  const current=state.queue[state.index]?.id===before;const queue=state.queue.map(track=>track.id===before?after:track);
  if(current&&reload){active?.pause();active?.dispose();active=null;update({queue,currentTime:0,duration:0,playing:false,playNonce:state.playNonce+1},true);}else update({queue},true);
 });}
 function restore(saved: Partial<MediaState>) { active?.pause(); active?.dispose(); active = null; state = { ...EMPTY_MEDIA, ...saved, playing: false, owner: "phone", revision: (saved.revision ?? 0) + 1 }; listeners.forEach(fn => fn()); driver.changed(state); }
 return { getSnapshot: () => state, getPlayer: () => active?.object, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, play, video, next, control, prepareTransfer, prepareSelection, confirmTransfer, toPhone, reportBrowser, expireBrowser, remapTrack, restore };
}
export type MediaSession = ReturnType<typeof createMediaSession>;
