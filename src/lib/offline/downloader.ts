export * from "./downloader.impl";
import * as local from "./downloader.impl";
import { invokeBoundary } from "@/lib/backend/registry";
export const clearOfflineFiles:typeof local.clearOfflineFiles=kind=>invokeBoundary("offline.clear",[kind],{domain:"offline",write:true,atomic:false},()=>local.clearOfflineFiles(kind));
export const removeOfflineFile:typeof local.removeOfflineFile=id=>invokeBoundary("offline.remove",[id],{domain:"offline",write:true,atomic:false},()=>local.removeOfflineFile(id));
