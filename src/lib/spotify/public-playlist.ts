import * as local from "./public-playlist.impl";
import { expose } from "@/lib/backend/registry";
export * from "./public-playlist.impl";
export const fetchPublicSpotifyEntity: typeof local.fetchPublicSpotifyEntity = expose("publicSpotify.fetchPublicSpotifyEntity", local.fetchPublicSpotifyEntity, { domain: "catalog", atomic: false });
export const fetchPublicSpotifyPlaylist: typeof local.fetchPublicSpotifyPlaylist = expose("publicSpotify.fetchPublicSpotifyPlaylist", local.fetchPublicSpotifyPlaylist, { domain: "catalog", atomic: false });
