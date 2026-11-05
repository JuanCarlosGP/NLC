import * as local from "./favorites.impl";
import { expose } from "@/lib/backend/registry";
export * from "./favorites.impl";
export const loadVideoFavorites: typeof local.loadVideoFavorites = expose("videoFavorites.loadVideoFavorites", local.loadVideoFavorites, { domain: "videoFavorites", write: false, phoneOnly: false, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
export const toggleVideoFavorite: typeof local.toggleVideoFavorite = expose("videoFavorites.toggleVideoFavorite", local.toggleVideoFavorite, { domain: "videoFavorites", write: true, phoneOnly: false, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
export const replaceVideoFavorites: typeof local.replaceVideoFavorites = expose("videoFavorites.replaceVideoFavorites", local.replaceVideoFavorites, { domain: "videoFavorites", write: true, phoneOnly: true, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
export const reloadVideoFavorites: typeof local.reloadVideoFavorites = expose("videoFavorites.reloadVideoFavorites", local.reloadVideoFavorites, { domain: "videoFavorites", write: false, phoneOnly: false, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
