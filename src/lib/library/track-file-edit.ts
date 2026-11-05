import * as local from "./track-file-edit.impl";
import { expose } from "@/lib/backend/registry";
export { isYoutubeUrl, renamedAudioPath } from "./track-file-edit.impl";
export const renameTrackFile: typeof local.renameTrackFile = expose("track.renameFile",local.renameTrackFile,{domain:"catalog",write:true,atomic:false,key:args=>args[2]});
export const applyTrackCoverUrl: typeof local.applyTrackCoverUrl = expose("track.coverUrl",local.applyTrackCoverUrl,{domain:"catalog",write:true,atomic:false,key:args=>args[2]});
export {replaceTrackAudio} from "@/lib/backend/track-jobs";
