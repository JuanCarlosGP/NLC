import { invokeBoundary } from "@/lib/backend/registry";
import { onBackendChange } from "@/lib/backend/remote";
import { publishWebEvent } from "@/lib/backend/native-module";
import { remoteEnabled } from "@/lib/backend/profile";
import { onServiceImport } from "@/lib/service-backup/events";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { servicePreferences as AsyncStorage } from "@/lib/service-backup/preferences";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import { useMobileMercury } from "./use-mobile-mercury";
import type { MobileMercuryConnection } from "./mobile-types";
import { createIntegrationCache } from "./cache";
import { integrationStorage } from "./storage";
import { bridgeRequest, bridgeSnapshot, type BridgeStatus } from "./client";
import { validateSnapshot, type Mode, type Provider, type Snapshot } from "./model";
const cache = createIntegrationCache(integrationStorage);
const selectionKey = localDemoEnabled ? "nlc.integrations.selection.demo.v1" : "nlc.integrations.selection.v1";
type Copies = Record<Provider,Record<Mode,Snapshot | null>>;
type Selection = Record<Provider,Mode>;
type Value = { ready: boolean; copies: Copies; selection: Selection; status: BridgeStatus | null; online: boolean; busy: Provider | null; error: string | null; mobileMercury: MobileMercuryConnection | null; refresh(): Promise<void>; run(provider: Provider, action: "sync" | "example"): Promise<Snapshot>; save(value: Snapshot): Promise<void>; select(provider: Provider, mode: Mode): Promise<void>; clear(provider: Provider, mode: Mode): Promise<void>; };
const Context = createContext<Value | null>(null);
export function IntegrationsProvider({children}:{children:ReactNode}) {
  const [copies,setCopies]=useState<Copies>({whoop:{live:null,demo:null},mercury:{live:null,demo:null}});
  const loadFailed = useRef(false);
  const copiesRef=useRef(copies); copiesRef.current=copies;
  const [selection,setSelection]=useState<Selection>({whoop:"live",mercury:"live"});
  const [ready,setReady]=useState(false); const [status,setStatus]=useState<BridgeStatus | null>(null); const [online,setOnline]=useState(false); const [busy,setBusy]=useState<Provider | null>(null); const locked=useRef(false); const refreshing=useRef(false); const [error,setError]=useState<string | null>(null);
  const save=useCallback(async (value:Snapshot)=>{validateSnapshot(value);await cache.write(value);if(!remoteEnabled)publishWebEvent({type:"change",domain:"integrations"});if(value.provider==="mercury"&&value.mode==="live")loadFailed.current=false;setError(null);setCopies(previous=>{const next={...previous,[value.provider]:{...previous[value.provider],[value.mode]:value}};copiesRef.current=next;return next;});},[]);
  const mobileMercury=useMobileMercury({ ready, current:()=>{const value=copiesRef.current.mercury.live;return value?.provider==="mercury"?value:null;}, save, allowAutomatic:()=>!loadFailed.current });
  const mobileEnabled=!!mobileMercury;
  const bridgeEnabled=!mobileEnabled || !!process.env.EXPO_PUBLIC_NLC_INTEGRATIONS_URL;
  const select=useCallback(async(provider:Provider,mode:Mode)=>{setSelection(previous=>{const next={...previous,[provider]:mode};void invokeBoundary("preferences.set",[selectionKey,JSON.stringify(next)],{domain:"preferences",write:true,key:args=>String(args[0])},()=>AsyncStorage.setItem(selectionKey,JSON.stringify(next))).catch(()=>setError("storage"));return next;});},[]);
  const refresh=useCallback(async()=>{
    if(!bridgeEnabled)return;
    if(refreshing.current)return; refreshing.current=true;
    try {
      const next=await bridgeRequest("/status") as BridgeStatus;setStatus(next);setOnline(true);
      for(const provider of (mobileEnabled?["whoop"]:["whoop","mercury"]) as Provider[])if(copiesRef.current[provider].live && next[provider].lastSync && next[provider].lastSync!==copiesRef.current[provider].live?.syncedAt && !locked.current) {
        const snapshot=await bridgeSnapshot(provider,"snapshot");if(!snapshot)continue;
        const current=copiesRef.current[provider].live;
        if(current && current.owner!==snapshot.owner){setError("accountChanged");continue;}
        await save(snapshot);
      }
    }catch(err){setOnline(false);if(err instanceof Error && err.message!=="network")setError("storage");}finally{refreshing.current=false;}
  },[save,bridgeEnabled,mobileEnabled]);
  useEffect(()=>{let cancelled=false;void(async()=>{
    try {const result:Copies={whoop:{live:null,demo:null},mercury:{live:null,demo:null}};for(const provider of ["whoop","mercury"] as const)for(const mode of ["live","demo"] as const)result[provider][mode]=await cache.read(provider,mode);if(cancelled)return;copiesRef.current=result;setCopies(result);
      const stored=await AsyncStorage.getItem(selectionKey);if(stored){const parsed=JSON.parse(stored);if(["live","demo"].includes(parsed.whoop)&&["live","demo"].includes(parsed.mercury)&&!cancelled)setSelection(parsed);}
    }catch{if(!cancelled){loadFailed.current=true;setError("storage");}}finally{if(!cancelled)setReady(true);}
  })();return()=>{cancelled=true;};},[]);
  useEffect(() => onBackendChange(domain => { if (domain !== "integrations" && domain !== "*") return; void (async () => {
    const result: Copies = { whoop: { live: null, demo: null }, mercury: { live: null, demo: null } };
    for (const provider of ["whoop", "mercury"] as const) for (const mode of ["live", "demo"] as const) result[provider][mode] = await cache.read(provider, mode);
    copiesRef.current = result; setCopies(result);
  })().catch(() => setError("storage")); }), []);
  useEffect(() => onServiceImport((service) => { if (service !== "health" && service !== "wealth") return; void (async () => {
    const result: Copies = { whoop: { live: null, demo: null }, mercury: { live: null, demo: null } };
    for (const provider of ["whoop", "mercury"] as const) for (const mode of ["live", "demo"] as const) result[provider][mode] = await cache.read(provider, mode);
    copiesRef.current = result; setCopies(result);
    const stored = await AsyncStorage.getItem(selectionKey); if (stored) { const value = JSON.parse(stored); if (["live", "demo"].includes(value.whoop) && ["live", "demo"].includes(value.mercury)) setSelection(value); }
  })().catch(() => setError("storage")); }), []);
  useEffect(()=>{if(!ready||!bridgeEnabled)return;void refresh();const timer=setInterval(()=>{if(AppState.currentState==="active")void refresh();},30000);const event=AppState.addEventListener("change",state=>{if(state==="active")void refresh();});return()=>{clearInterval(timer);event.remove();};},[ready,refresh,bridgeEnabled]);
  async function run(provider:Provider,action:"sync"|"example") {if(locked.current)throw new Error("busy");locked.current=true;setBusy(provider);setError(null);try{const snapshot=await bridgeSnapshot(provider,action);if(!snapshot)throw new Error("invalid");setOnline(true);return snapshot;}finally{locked.current=false;setBusy(null);void refresh();}}
  async function clear(provider:Provider,mode:Mode){await cache.clear(provider,mode);setError(null);setCopies(previous=>({...previous,[provider]:{...previous[provider],[mode]:null}}));}
  return <Context.Provider value={{ready,copies,selection,status,online,busy,error,mobileMercury,refresh,run,save,select,clear}}>{children}</Context.Provider>;
}
export function useIntegrations(){const value=useContext(Context);if(!value)throw new Error("IntegrationsProvider missing");return value;}
