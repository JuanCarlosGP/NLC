import * as raw from "./artwork-cache.impl";
import { invokeBoundary } from "@/lib/backend/registry";
import { onBackendChange } from "@/lib/backend/remote";
export * from "./artwork-cache.impl";
export const hydrateTrackArtworkCache: typeof raw.hydrateTrackArtworkCache = () => invokeBoundary("artwork.hydrate",[],{domain:"preferences",phoneOnly:true},()=>raw.hydrateTrackArtworkCache());
export const reloadTrackArtworkCache: typeof raw.reloadTrackArtworkCache = () => invokeBoundary("artwork.reload",[],{domain:"preferences",phoneOnly:true},()=>raw.reloadTrackArtworkCache());
export const rememberTrackArtwork: typeof raw.rememberTrackArtwork = entries => invokeBoundary("artwork.remember",[entries],{domain:"preferences",write:true,phoneOnly:true,key:()=>"nlc.track-meta.v2"},()=>raw.rememberTrackArtwork(entries));
export const syncArtworkFromPlaylists: typeof raw.syncArtworkFromPlaylists = lists => invokeBoundary("artwork.sync",[lists],{domain:"preferences",write:true,phoneOnly:true,key:()=>"nlc.track-meta.v2"},()=>raw.syncArtworkFromPlaylists(lists));
onBackendChange(domain=>{if(domain==="preferences"||domain==="*")void reloadTrackArtworkCache().catch(()=>{});});
