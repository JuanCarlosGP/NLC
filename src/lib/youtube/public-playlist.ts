import * as local from "./public-playlist.impl";
import { expose } from "@/lib/backend/registry";
export * from "./public-playlist.impl";
export const fetchPublicYoutubeMusic: typeof local.fetchPublicYoutubeMusic = expose("publicYoutube.fetchPublicYoutubeMusic", local.fetchPublicYoutubeMusic, { domain: "catalog", atomic: false });
