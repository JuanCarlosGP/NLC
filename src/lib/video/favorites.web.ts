import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend } from "@/lib/backend/remote";
import * as local from "./favorites.impl";
export * from "./favorites.impl";
let memory: local.VideoFavorite[] = [];
export const peekVideoFavorites = () => remoteEnabled ? memory : local.peekVideoFavorites();
export const isVideoFavorite = (path: string) => remoteEnabled ? memory.some(row => row.path === path) : local.isVideoFavorite(path);
export async function loadVideoFavorites() { if (!remoteEnabled) return local.loadVideoFavorites(); return memory = await browserBackend.invoke("videoFavorites.reloadVideoFavorites", [], { domain: "videoFavorites" }); }
export const reloadVideoFavorites = loadVideoFavorites;
export async function toggleVideoFavorite(show: local.VideoFavorite) { if (!remoteEnabled) return local.toggleVideoFavorite(show); const result = await browserBackend.invoke<boolean>("videoFavorites.toggleVideoFavorite", [show], { domain: "videoFavorites", write: true, key: args => String(args[0]?.id ?? "$collection") }); await loadVideoFavorites(); return result; }
