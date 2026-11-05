import { uploadProgress } from "./upload-progress";
import { notifyCatalog } from "@/lib/db/catalog";
import { emitPlaylistStoreChanged } from "@/lib/spotify/playlist-store";
import { onBackendChange } from "./remote";
import { rememberDraftFields, conflictDraft, reloadConflictRecord } from "./edit-drafts";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, View, Text } from "react-native";
import { remoteEnabled } from "./profile";
import { bootstrap, remoteState, markRemoteDraft } from "./remote";
import { APPEARANCE_KEY } from "@/lib/appearance/themes";
export function RemoteGate({ children }: { children: ReactNode }) {
 useEffect(() => !remoteEnabled ? undefined : onBackendChange(domain => { if (["catalog", "offline", "*"].includes(domain)) notifyCatalog(); if (["playlists", "*"].includes(domain)) emitPlaylistStoreChanged(); }), []);
 const upload = useSyncExternalStore(uploadProgress.subscribe,uploadProgress.getSnapshot,uploadProgress.getSnapshot);
 const [savedDraft,setSavedDraft]=useState(conflictDraft),[showDraft,setShowDraft]=useState(false);
 const [ready, setReady] = useState(!remoteEnabled);
 const state = useSyncExternalStore(remoteState.subscribe, remoteState.getSnapshot, remoteState.getSnapshot);
 useEffect(()=>{if(state.conflict)setSavedDraft(conflictDraft());},[state.conflict]);
 useEffect(() => {
  if (!remoteEnabled) return;
  let active = true;
  const start = async () => { try {
   const phone = await bootstrap();
   if (!localStorage.getItem(APPEARANCE_KEY)) localStorage.setItem(APPEARANCE_KEY, phone.preferences.theme);
   for (const [key, value] of Object.entries(phone.presentation || {})) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
   if (!localStorage.getItem("nlc.locale.v1")) localStorage.setItem("nlc.locale.v1", phone.preferences.locale);
   if (active) setReady(true);
  } catch { /* Retry is explicit; existing drafts are left untouched. */ } };
  void start(); document.addEventListener("input", rememberDraftFields, true);
  return () => { active = false; document.removeEventListener("input", rememberDraftFields, true); };
 }, []);
 if (!remoteEnabled) return children;
 return <View style={{ flex: 1, backgroundColor: "#000" }}>
  {(!state.connected || state.stale || state.conflict) && <View accessibilityRole="alert" style={{ padding: 10, backgroundColor: "#202020", flexDirection: "row", gap: 12 }}>
   <Text style={{ color: "#fff", flex: 1 }}>{state.stale ? "Hay una nueva versión. Recarga para continuar; el borrador se conserva." : state.conflict ? "El registro ha cambiado. Recarga para revisarlo; el borrador se conserva." : state.error || "Conectando con el móvil…"}</Text>
   <Pressable accessibilityRole="button" onPress={() => state.conflict ? reloadConflictRecord() : state.stale ? (rememberDraftFields(), window.location.reload()) : void bootstrap(true).then(() => setReady(true)).catch(() => {})}><Text style={{ color: "#fff" }}>{state.conflict ? "Recargar registro" : state.stale ? "Recargar" : "Reintentar"}</Text></Pressable>
  </View>}
  {savedDraft && <View style={{padding:10,backgroundColor:"#202020"}}><Pressable accessibilityRole="button" onPress={()=>setShowDraft(value=>!value)}><Text style={{color:"#fff"}}>{showDraft?"Cerrar borrador":"Ver borrador anterior"}</Text></Pressable>{showDraft&&savedDraft.fields.map((field,index)=><Text selectable key={index} style={{color:"#fff",paddingTop:6}}>{field.label}: {field.value}</Text>)}</View>}
  {upload && <View accessibilityLiveRegion="polite" style={{padding:10,backgroundColor:"#202020",flexDirection:"row",gap:12}}><Text style={{color:"#fff",flex:1}}>{upload.name} · {upload.total ? Math.round(upload.done/upload.total*100) : 0}%</Text><Pressable accessibilityRole="button" onPress={upload.cancel}><Text style={{color:"#fff"}}>Cancelar subida</Text></Pressable></View>}
  {ready ? children : null}
 </View>;
}
