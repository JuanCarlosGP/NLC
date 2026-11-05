import * as local from "./playlist-sync.impl";
import { invokeBoundary } from "@/lib/backend/registry";
export * from "./playlist-sync.impl";
export const pullPlaylistsFromSources: typeof local.pullPlaylistsFromSources = (settings, password) => invokeBoundary("sync.playlists.pull", [], { domain: "playlists", write: true, atomic: false }, () => local.pullPlaylistsFromSources(settings, password));
export const pushPlaylistsToSources: typeof local.pushPlaylistsToSources = (settings, password) => invokeBoundary("sync.playlists.push", [], { domain: "playlists", write: false, atomic: false }, () => local.pushPlaylistsToSources(settings, password));
