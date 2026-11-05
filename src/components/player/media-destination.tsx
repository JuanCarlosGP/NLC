import { useEffect, useRef, useSyncExternalStore } from "react";
import { AppState, Pressable, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Text } from "@/components/ui/themed-text";
import { mediaSession } from "@/lib/player/session";
import { watchRoute } from "@/lib/video/onepiece";
import { colors, type } from "@/lib/theme";
export function MediaDestination() {
 const state = useSyncExternalStore(mediaSession.subscribe, mediaSession.getSnapshot, mediaSession.getSnapshot), router=useRouter(), path=usePathname(), consumed=useRef("");
 useEffect(()=>{
  const open=()=>{const current=mediaSession.getSnapshot(),key=`${current.playNonce}:${current.videoPath}`;
   if(AppState.currentState!=="active" || current.owner!=="phone" || current.kind!=="video" || !current.videoPath || !current.playing || consumed.current===key)return;
   consumed.current=key; if(!path.startsWith("/watch/"))router.push(watchRoute(current.videoPath,current.videoPath.slice(0,current.videoPath.lastIndexOf("/"))));
  };open();const subscription=AppState.addEventListener("change",open);return()=>subscription.remove();
 },[state.owner,state.kind,state.playNonce,path,router]);
 if(state.owner==="phone")return null;
 return <View style={{padding:8,backgroundColor:colors.sheet}}><Pressable onPress={()=>{void mediaSession.toPhone();}}><Text style={type.meta}>Reproduciendo en el navegador · Traer al móvil</Text></Pressable></View>;
}
