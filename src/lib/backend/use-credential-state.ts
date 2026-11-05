import {useEffect,useState} from "react";
import {remoteEnabled} from "./profile";
import {browserBackend,onBackendChange} from "./remote";
export function useCredentialState(){const [state,setState]=useState<{nas:boolean;downloader:boolean}|null>(null);useEffect(()=>{if(!remoteEnabled)return;const refresh=()=>{void browserBackend.invoke<{nas:boolean;downloader:boolean}>("credentials.state",[],{domain:"credentials"}).then(setState).catch(()=>{});};refresh();return onBackendChange(domain=>{if(domain==="credentials"||domain==="*")refresh();});},[]);return state;}
