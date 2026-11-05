import { browserBackend, mediaUrl } from "./remote";
import type { MusicSource, PingResult } from "@/lib/nas/types";
import type { NasSettings } from "@/lib/settings/storage";
const read = <T,>(name: string, args: unknown[] = []) => browserBackend.invoke<T>(`source.${name}`, args, { domain: "catalog" });
export const remoteMusicSource: MusicSource = {
 kind: "local", ping: () => read("ping"), getArtists: () => read("artists"), getAlbums: () => read("albums"), getAlbum: id => read("album", [id]), getTracks: id => read("tracks", [id]), search: query => read("search", [query]),
 streamUrl: async id => mediaUrl("track", id), coverUrl: async id => mediaUrl("cover", id),
 deleteTrack: id => browserBackend.invoke("source.deleteTrack", [id, true], { domain: "catalog", write: true, atomic: false, key: args => args[0] }),
 ensureCoverSidecar: (id, url) => browserBackend.invoke("source.coverSidecar", [id, url], { domain: "catalog", write: true, atomic: false, key: args => args[0] }),
 refresh: () => browserBackend.invoke("source.refresh", [], { domain: "catalog", write: true, atomic: false }),
};
export function remotePing(settings: NasSettings, password: string): Promise<PingResult> { return read("pingConnection", [settings, password]); }
