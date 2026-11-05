import {remoteEnabled} from "./profile";
import {browserBackend} from "./remote";
import {expectedEditVersion} from "./edit-drafts";
import {uploadFile,awaitTransfer,cancelTransfer} from "./transfers";
import {replaceTrackAudio as local} from "@/lib/library/track-file-edit.impl";
export const replaceTrackAudio:typeof local=async args=>{
 if(!remoteEnabled)return local(args);if(args.confirmed!==true)throw new Error("confirmation_required");
 const job=await uploadFile(new Blob([]),"audio-replace");await browserBackend.invoke("track.replaceAudio.start",[job.id,{trackId:args.trackId,youtubeUrl:args.youtubeUrl,confirmed:true,expectedVersion:expectedEditVersion("catalog",`catalog:${args.trackId}`,true)}],{domain:"mediaJobs",atomic:false});
 const cancel=()=>{void cancelTransfer(job.id).catch(()=>{});};args.signal?.addEventListener("abort",cancel,{once:true});if(args.signal?.aborted)cancel();
 try{return (await awaitTransfer(job.id,state=>args.onProgress?.(state.phase||""))).result.trackId;}finally{args.signal?.removeEventListener("abort",cancel);}
};
