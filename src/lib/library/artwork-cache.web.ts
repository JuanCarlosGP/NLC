export * from "./artwork-cache.impl";
import { onBackendChange } from "@/lib/backend/remote";
import { reloadTrackArtworkCache } from "./artwork-cache.impl";
onBackendChange(domain=>{if(domain==="preferences"||domain==="*")void reloadTrackArtworkCache().catch(()=>{});});
