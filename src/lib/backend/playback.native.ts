import { mediaSession, loadMediaSession, reportRemotePlayback } from "@/lib/player/session.native";
import { expose } from "./registry";
import { knownTrack } from "./known-media.native";
import { knownVideo } from "./video.native";
import { BackendError } from "./protocol";
import type { Track } from "@/lib/nas/types";
async function tracks(ids: string[]): Promise<Track[]> { if (!Array.isArray(ids) || ids.length > 10000 || ids.some(id => typeof id !== "string")) throw new BackendError(400, "invalid_queue"); return Promise.all(ids.map(knownTrack)); }
expose("playback.state", async () => { await loadMediaSession(); return mediaSession.getSnapshot(); }, { domain: "playback", atomic: false });
expose("playback.play", async (ids: string[], index: number, owner: string, revision: number) => { await loadMediaSession(); if (owner !== "phone" && !/^[a-zA-Z0-9_-]{16,80}$/.test(owner)) throw new BackendError(400, "invalid_client"); await mediaSession.play(await tracks(ids), index, owner, revision); return mediaSession.getSnapshot(); }, { domain: "playback", write: true, atomic: false });
expose("playback.video", async (id: string, position: number, owner: string) => { if (owner !== "phone" && !/^[a-zA-Z0-9_-]{16,80}$/.test(owner)) throw new BackendError(400, "invalid_client"); if (!(await knownVideo(id)) || (await knownVideo(id))?.directory) throw new BackendError(404, "unknown_video"); if (typeof position !== "number" || !Number.isFinite(position) || position < 0) throw new BackendError(400, "invalid_position"); await mediaSession.video(id, position, owner); return mediaSession.getSnapshot(); }, { domain: "playback", write: true, atomic: false });
expose("playback.control", async (method: string, value: any, revision: number) => {
 if (method === "next" || method === "prev") await mediaSession.next(method === "next" ? 1 : -1, revision);
 else { if (method === "enqueue") value = { ...value, tracks: await tracks(value.ids) }; await mediaSession.control(method, value, revision); }
 return mediaSession.getSnapshot();
}, { domain: "playback", write: true, atomic: false });
expose("playback.prepare", async (client: string, id: string) => mediaSession.prepareTransfer(client, id), { domain: "playback", atomic: false });
expose("playback.confirm", async (client: string, id: string) => mediaSession.confirmTransfer(client, id), { domain: "playback", write: true, atomic: false });
expose("playback.phone", async (revision: number) => { await mediaSession.toPhone(revision); return mediaSession.getSnapshot(); }, { domain: "playback", write: true, atomic: false });
expose("playback.progress", reportRemotePlayback, {domain:"playback",atomic:false});
