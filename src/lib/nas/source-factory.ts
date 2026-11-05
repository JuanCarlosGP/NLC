import { createMusicSource as createLocal } from "./source-factory.impl";
import { remoteEnabled } from "@/lib/backend/profile";
import { invokeBoundary } from "@/lib/backend/registry";
import type { NasSettings } from "@/lib/settings/storage";
import type { MusicSource } from "./types";
export * from "./source-factory.impl";
export function createMusicSource(settings: NasSettings, password: string): MusicSource {
 const source = createLocal(settings, password); if (remoteEnabled) return source;
 const wrapped: any = { kind: source.kind };
 for (const [method, operation] of Object.entries({ ping: "ping", getArtists: "artists", getAlbums: "albums", getAlbum: "album", getTracks: "tracks", search: "search", refresh: "refresh", deleteTrack: "deleteTrack", ensureCoverSidecar: "coverSidecar" })) {
  const fn = (source as any)[method]; if (typeof fn !== "function") continue;
  wrapped[method] = (...args: any[]) => invokeBoundary(`source.${operation}`, args, { domain: "catalog", write: ["refresh", "deleteTrack", "ensureCoverSidecar"].includes(method), atomic: false, key: values => ["deleteTrack","ensureCoverSidecar"].includes(method) ? String(values[0]) : "$collection" }, () => fn.apply(source, args));
 }
 wrapped.streamUrl = source.streamUrl.bind(source); wrapped.coverUrl = source.coverUrl.bind(source); return wrapped;
}
