import * as Crypto from "expo-crypto";
import {webNative,publishWebEvent} from "./native-module";
import {getDb} from "@/lib/db/client";
import {knownTrack} from "./known-media.native";
import {expose} from "./registry";
import {BackendError} from "./protocol";
import {serialize,assertWriteAvailable} from "./native";
import {expectedEditVersion} from "./edit-drafts";
import {loadNasSettings,loadNasPassword} from "@/lib/settings/storage.impl";
import {loadDownloadSettings,loadDownloadToken} from "@/lib/podcasts/download-settings.impl";
import {replaceTrackAudio as replace,isYoutubeUrl} from "@/lib/library/track-file-edit.impl";
import {mediaSession} from "@/lib/player/session.native";
type Input={trackId:string;youtubeUrl:string;confirmed:boolean;expectedVersion:number};
async function version(id:string){return (await (await getDb()).getFirstAsync<{version:number}>("SELECT version FROM backend_versions WHERE key=?",`catalog:${id}`))?.version??0;}
async function start(id:string,input:Input) {
 await assertWriteAvailable();
 if(input?.confirmed!==true)throw new BackendError(400,"confirmation_required");
 if(!isYoutubeUrl(input.youtubeUrl)||!input.trackId.startsWith("/"))throw new BackendError(400,"invalid_source");await knownTrack(input.trackId);
 if((await loadNasSettings()).sourceKind!=="webdav")throw new BackendError(400,"source_not_file");
 if(input.expectedVersion!==await version(input.trackId))throw new BackendError(409,"version_conflict");
 const native=webNative(),job=JSON.parse(await native.readWebTransferRecord(id));if(job.status!=="uploaded")return id;
 await native.updateWebTransfer(id,JSON.stringify({status:"processing",phase:"downloading",service:"music",private:{...input,kind:"trackAudio"}}));native.startWebJob(id,"track-audio-replace");return id;
}
expose("track.replaceAudio.start",start,{domain:"mediaJobs",atomic:false});
export async function runTrackAudioJob(id:string) {
 const native=webNative();try {
  const job=JSON.parse(await native.readWebTransferRecord(id)),input:Input=job.private;if(job.status!=="processing"||job.private?.kind!=="trackAudio")return;
  const check=async()=>{if(JSON.parse(await native.readWebTransferRecord(id)).status!=="processing")throw new Error("cancelled");};
  const next=await replace({trackId:input.trackId,youtubeUrl:input.youtubeUrl,nas:await loadNasSettings(),password:await loadNasPassword(),download:await loadDownloadSettings(),token:await loadDownloadToken(),checkCancelled:check,
   commit:work=>serialize(async()=>{await assertWriteAvailable();await check();if(input.expectedVersion!==await version(input.trackId))throw new BackendError(409,"version_conflict");await native.commitWebTransfer(id);const next=await work();await mediaSession.remapTrack(input.trackId,await knownTrack(next),true);return next;})});
  await native.updateWebTransfer(id,JSON.stringify({status:"complete",result:{trackId:next}}));publishWebEvent({type:"change",domain:"catalog"});
 }catch(error){await native.updateWebTransfer(id,JSON.stringify({status:"error",error:error instanceof Error?error.message:"replacement_failed"})).catch(()=>{});}
}
export const replaceTrackAudio: typeof replace = async args=>{
 if(args.confirmed!==true)throw new BackendError(400,"confirmation_required");const native=webNative(),id=Crypto.randomUUID();await native.createEmptyWebTransfer(id,"audio-replace");
 await serialize(async()=>start(id,{trackId:args.trackId,youtubeUrl:args.youtubeUrl,confirmed:true,expectedVersion:expectedEditVersion("catalog",`catalog:${args.trackId}`)??await version(args.trackId)}));
 const cancel=()=>{void native.cancelWebTransfer(id).catch(()=>{});};args.signal?.addEventListener("abort",cancel,{once:true});if(args.signal?.aborted)cancel();
 try {for(;;){const job=JSON.parse(await native.readWebTransferRecord(id));args.onProgress?.(job.phase||"");if(job.status==="complete")return job.result.trackId;if(["error","cancelled"].includes(job.status))throw new Error(job.error||job.status);await new Promise(resolve=>setTimeout(resolve,600));}}
 finally{args.signal?.removeEventListener("abort",cancel);}
};
