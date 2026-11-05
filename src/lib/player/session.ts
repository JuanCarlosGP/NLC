import { mediaSession as local } from "./session.native";
import { invokeBoundary } from "@/lib/backend/registry";
export { loadMediaSession } from "./session.native";
function command<T>(method:string,args:unknown[],task:()=>Promise<T>) {return invokeBoundary(`playback.${method}`,args,{domain:"playback",write:true,atomic:false},task);}
export const mediaSession={...local,
 play:(...args:Parameters<typeof local.play>)=>command("play",[args[0].map(track=>track.id),args[1]??0,args[2]??"phone",args[3]],()=>local.play(...args)),
 video:(...args:Parameters<typeof local.video>)=>command("video",args,()=>local.video(...args)),
 control:(...args:Parameters<typeof local.control>)=>command("control",args,()=>local.control(...args)),
 next:(...args:Parameters<typeof local.next>)=>command("control",[args[0]===1?"next":"prev",null,args[1]],()=>local.next(...args)),
 toPhone:(...args:Parameters<typeof local.toPhone>)=>command("phone",args,()=>local.toPhone(...args)),
};
