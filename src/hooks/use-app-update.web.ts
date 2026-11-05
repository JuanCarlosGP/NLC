import { useSyncExternalStore } from "react";
import { remoteEnabled, PHONE_ONLY, phoneOnly } from "@/lib/backend/profile";
import { remoteState } from "@/lib/backend/remote";
import { useAppUpdate as localUpdate, usePendingUpdate as localPending } from "./use-app-update.local";
export type { ApkStatus, OtaStatus } from "./use-app-update.local";
export function usePendingUpdate() { if(!remoteEnabled)return localPending();return false; }
export function useAppUpdate():ReturnType<typeof localUpdate> {
 if(!remoteEnabled)return localUpdate();
 const state=useSyncExternalStore(remoteState.subscribe,remoteState.getSnapshot,remoteState.getSnapshot);
 const version=state.bootstrap?.version??"—";
 return {localVersion:version,buildLabel:version,remote:null,apkStatus:"none",otaStatus:"unsupported",busy:false,apkProgress:null,apkError:false,apkSummary:PHONE_ONLY,otaSummary:PHONE_ONLY,refresh:async()=>{},downloadApk:phoneOnly,applyOta:async()=>phoneOnly()};
}
