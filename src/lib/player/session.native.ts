import { readMediaRemap, onMediaRemap } from "./media-remap";
import { getDb } from "@/lib/db/client";
import { serialize, assertWriteAvailable } from "@/lib/backend/native";
import { markWatching, flushWatchProgress } from "@/lib/video/watch-history.impl";
import { seriesFromPath, episodeLocation } from "@/lib/video/browse";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createMediaSession, type MediaState, type PreparedMedia } from "./session-core";
import { createMusicSource } from "@/lib/nas/source-factory.internal";
import { createVideoClient } from "@/lib/video/source";
import { loadNasSettings, loadNasPassword } from "@/lib/settings/storage.impl";
import { getLocalUri, pushRecent } from "@/lib/db/catalog.impl";
import { publishWebEvent } from "@/lib/backend/native-module";
import { LOCK_SCREEN_OPTIONS, lockScreenMetadata } from "./lock-screen";
import { onLocalMoveLock } from "@/lib/local/move-lock";
import { onLocalMoveRemap } from "@/lib/local/move/service";
const KEY = "nlc.media-session.v1";
let lastPlaying=false;let lastEvent = 0; let lastRevision = -1; let saveQueue: Promise<unknown> = Promise.resolve();
export const mediaSession = createMediaSession({
 changed: state => { if (state.playing!==lastPlaying || state.revision !== lastRevision || Date.now() - lastEvent > 900) { lastEvent = Date.now(); lastRevision = state.revision;lastPlaying=state.playing; publishWebEvent({ type: "change", domain: "playback" }); } },
 save: state => { const result = saveQueue.then(() => AsyncStorage.setItem(KEY, JSON.stringify(state))); saveQueue = result.catch(() => {}); return result; },
 prepare: async (state, report) => {
  const settings = await loadNasSettings(), password = await loadNasPassword();
  if (state.kind === "video") {
   const path = state.videoPath!, series = seriesFromPath(path), location = episodeLocation(path);
   await markWatching({ seriesId: series.id, seriesTitle: series.title, path, ...location, number: 0, title: path.split("/").at(-1) || series.title, positionSec: state.currentTime, durationSec: state.duration });
   let savedAt = 0;
   const progress = (position: number, duration: number, playing: boolean, ended = false) => { report(position, duration, playing, ended); if (Date.now() - savedAt > 3500 || ended) { savedAt = Date.now(); void serialize(async()=>{await assertWriteAvailable();await flushWatchProgress(position, duration, path);}).catch(()=>{}); } };
   const source = await createVideoClient(settings, password).playable(state.videoPath!);
   const player = createVideoPlayer(source); player.timeUpdateEventInterval = 1; player.staysActiveInBackground = true; player.showNowPlayingNotification = true;
   const listeners = [player.addListener("timeUpdate", value => progress(value.currentTime, player.duration, player.playing)), player.addListener("playingChange", value => progress(player.currentTime, player.duration, value.isPlaying)), player.addListener("playToEnd", () => progress(player.duration, player.duration, false, true))];
   try { await waitReady(() => player.status === "readyToPlay", () => player.status === "error"); } catch (error) { listeners.forEach(item => item.remove()); player.release(); throw error; }
   return { object: player, play: () => player.play(), pause: () => player.pause(), seek: seconds => { player.currentTime = seconds; }, dispose: () => { listeners.forEach(item => item.remove()); player.release(); } };
  }
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix", interruptionModeAndroid: "doNotMix" });
  const track = state.queue[state.index]; const uri = await getLocalUri(track.id); const source = uri || await createMusicSource(settings, password).streamUrl(track.id);
  const player = createAudioPlayer(source, { updateInterval: 250 });
  const subscription = player.addListener("playbackStatusUpdate", value => report(value.currentTime, value.duration, value.playing, value.didJustFinish));
  const skip = (player as any).addListener("lockScreenSkip", (value: { direction: string }) => { void serialize(()=>mediaSession.next(value.direction === "previous" ? -1 : 1)).catch(()=>{}); });
  try { await waitReady(() => player.isLoaded, () => player.currentStatus.playbackState === "error"); } catch (error) { subscription.remove(); skip.remove(); player.remove(); throw error; }
  void serialize(async()=>{await assertWriteAvailable();await pushRecent(track);}).catch(()=>{});
  return { object: player, play: () => { player.play(); }, committed: () => { try { player.setActiveForLockScreen(true, lockScreenMetadata(track), LOCK_SCREEN_OPTIONS); } catch {} }, pause: () => player.pause(), seek: seconds => player.seekTo(seconds), dispose: () => { subscription.remove(); skip.remove(); try { player.clearLockScreenControls(); } catch {} player.remove(); } };
 },
});
async function waitReady(ready: () => boolean, failed: () => boolean) { const end = Date.now() + 15000; while (!ready()) { if (failed() || Date.now() > end) throw new Error("media_unavailable"); await new Promise(resolve => setTimeout(resolve, 50)); } }
let loaded: Promise<void> | null = null;
export function loadMediaSession() { return loaded ??= AsyncStorage.getItem(KEY).then(async raw => { if (raw) { const value = JSON.parse(raw); if (Array.isArray(value.queue) && value.queue.length <= 10000) {const mapping=await readMediaRemap(await getDb());mediaSession.restore(remapState(value,mapping.ids,mapping.uris));} } }); }
onLocalMoveLock(active => { if (active) void mediaSession.control("pause"); });
onLocalMoveRemap((ids, uris) => { const state = mediaSession.getSnapshot(); const queue = state.queue.map(track => ({ ...track, id: ids.get(track.id) ?? track.id, coverId: track.coverId ? uris.get(track.coverId) ?? track.coverId : track.coverId, artworkUrl: track.artworkUrl ? uris.get(track.artworkUrl) ?? track.artworkUrl : track.artworkUrl })); mediaSession.restore({ ...state, queue, videoPath: state.videoPath ? ids.get(state.videoPath) ?? state.videoPath : null }); });

import { bindGlobalDevicePlayer, findDeviceTrack } from "@/lib/bridge/device-player";
import { decodeVideoId } from "@/lib/video/onepiece";
bindGlobalDevicePlayer(query => serialize(async () => {
 await loadMediaSession();
 if(query.op?.startsWith("web-"))return handleTuiWebMedia(query);
 const state = mediaSession.getSnapshot(), op = query.op || "status";
 if (op === "play") {
  if (query.id?.startsWith("video:")) await mediaSession.video(decodeVideoId(query.id.slice(6)));
  else await findDeviceTrack(query.id).then(track => { if (track) return mediaSession.play([track]); });
 } else if (op === "pause") { if ((query.paused !== "0") === state.playing) await mediaSession.control("toggle"); }
 else if (op === "stop") await mediaSession.control("pause");
 return { ok: true, pos: state.currentTime, dur: state.duration, paused: !state.playing, ended: !state.playing && state.duration > 0 && state.currentTime >= state.duration - 0.5 };
}));

setInterval(() => mediaSession.expireBrowser(), 2000);

import { knownTrack } from "@/lib/backend/known-media.native";
import { knownVideo } from "@/lib/backend/video.native";
const tuiQueues=new Map<string,{stage:string;part:number;tracks:import("@/lib/nas/types").Track[];expires:number}>();
async function handleTuiWebMedia(query:Record<string,string>):Promise<Record<string,unknown>> {
 const client=query.client;if(!/^[a-zA-Z0-9_-]{16,80}$/.test(client||""))throw new Error("invalid_client");
 const op=query.op.slice(4);
 if(op==="state")return {ok:true,state:mediaSession.getSnapshot()};
 if(op==="queue") {
  for(const [id,value] of tuiQueues)if(value.expires<Date.now())tuiQueues.delete(id);
  const ids=JSON.parse(query.queue),part=Number(query.part);
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(query.stage||"")||!Array.isArray(ids)||ids.length>10||ids.some(id=>typeof id!=="string")||!Number.isInteger(part)||part<0)throw new Error("invalid_queue");
  let entry=tuiQueues.get(client);
  if(part===0){if(tuiQueues.size>=8&&!entry)throw new Error("too_many_clients");entry={stage:query.stage,part:0,tracks:[],expires:Date.now()+60000};tuiQueues.set(client,entry);}
  if(!entry||entry.stage!==query.stage||entry.part!==part||entry.tracks.length+ids.length>10000)throw new Error("invalid_queue_sequence");
  const tracks=await Promise.all(ids.map(knownTrack));entry.tracks.push(...tracks);entry.part++;entry.expires=Date.now()+60000;return {ok:true,count:entry.tracks.length};
 }
 if(op==="prepare") {
  const id=query.id||"", position=Number(query.position||0);if(!Number.isFinite(position)||position<0)throw new Error("invalid_position");
  let selection;
  if(id.startsWith("video:")) {const path=decodeVideoId(id.slice(6));if(!await knownVideo(path)) {const {discoverTuiVideo}=await import("@/lib/backend/video.native");await discoverTuiVideo(path);}selection={videoPath:path,position};}
  else {const track=await knownTrack(id), current=mediaSession.getSnapshot(),staged=tuiQueues.get(client),queue=staged&&staged.expires>Date.now()?staged.tracks:current.queue,index=queue.findIndex(item=>item.id===track.id);selection={queue:index>=0?queue:[track],index:Math.max(0,index),position};tuiQueues.delete(client);}
  return {ok:true,...mediaSession.prepareSelection(client,query.lease,selection)};
 }
 if(op==="confirm")return {ok:true,state:await mediaSession.confirmTransfer(client,query.lease)};
 if(op==="control") {const state=mediaSession.getSnapshot();if(state.owner!==client)return {ok:true,state};if(!["pause","toggle","seek"].includes(query.method))throw new Error("unknown_media_control");await mediaSession.control(query.method,query.method==="seek"?Number(query.position):undefined,Number(query.revision));return {ok:true,state:mediaSession.getSnapshot()};}
 if(op==="progress") {await reportRemotePlayback(client,Number(query.revision),Number(query.sequence),Number(query.position),Number(query.duration),query.playing==="1",false);return {ok:true};}
 throw new Error("unknown_media_control");
}

function remapState(state:MediaState, ids:Record<string,string>, uris:Record<string,string>) {
 return {...state,queue:state.queue.map(track=>({...track,id:ids[track.id]??track.id,coverId:track.coverId?uris[track.coverId]??track.coverId:track.coverId,artworkUrl:track.artworkUrl?uris[track.artworkUrl]??track.artworkUrl:track.artworkUrl})),videoPath:state.videoPath?ids[state.videoPath]??state.videoPath:null};
}
onMediaRemap(async(ids,uris)=>{await loadMediaSession();const state=remapState(mediaSession.getSnapshot(),ids,uris);mediaSession.restore(state);await AsyncStorage.setItem(KEY,JSON.stringify(mediaSession.getSnapshot()));publishWebEvent({type:"change",domain:"playback"});});

let lastRemoteVideoSave = 0;
export async function reportRemotePlayback(client:string,revision:number,sequence:number,position:number,duration:number,playing:boolean,ended:boolean) {
 const before=mediaSession.getSnapshot();
 const accepted=mediaSession.reportBrowser(client,revision,sequence,position,duration,playing,ended);
 if(accepted&&before.kind==="video"&&before.videoPath&&(Date.now()-lastRemoteVideoSave>3500||ended)) {
  lastRemoteVideoSave=Date.now();const path=before.videoPath,series=seriesFromPath(path),location=episodeLocation(path);
  await assertWriteAvailable();
  await markWatching({seriesId:series.id,seriesTitle:series.title,path,...location,number:0,title:path.split("/").at(-1)||series.title,positionSec:position,durationSec:duration});
  publishWebEvent({type:"change",domain:"preferences"});
 }
 return accepted;
}
