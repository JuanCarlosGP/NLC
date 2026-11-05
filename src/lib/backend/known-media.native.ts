import { servicePreferences } from "@/lib/service-backup/preferences";
import { getDb } from "@/lib/db/client";
import { getTracks } from "@/lib/db/catalog.impl";
import { loadNasSettings } from "@/lib/settings/storage.impl";
import type { Track } from "@/lib/nas/types";
import { BackendError } from "./protocol";
function signature(settings: unknown) { return JSON.stringify(settings); }
export async function rememberSourceResult(value: unknown): Promise<void> {
 const db = await getDb(), stamp = signature(await loadNasSettings());
 async function visit(value: any, depth = 0): Promise<void> {
  if (!value || depth > 5) return;
  if (Array.isArray(value)) { for (const item of value) await visit(item, depth + 1); return; }
  if (typeof value !== "object") return;
  if (typeof value.id === "string" && typeof value.title === "string" && typeof value.albumId === "string" && typeof value.artistId === "string") await db.runAsync("INSERT OR REPLACE INTO backend_source_tracks(id,signature,payload) VALUES (?,?,?)",value.id,stamp,JSON.stringify(value));
  if (typeof value.coverId === "string") await db.runAsync("INSERT OR IGNORE INTO backend_resources(kind,id,directory) VALUES ('cover',?,0)",value.coverId);
  for (const key of ["artists","albums","tracks"]) if (Array.isArray(value[key])) await visit(value[key], depth + 1);
 }
 await visit(value);
}
export async function knownTrack(id: string): Promise<Track> {
 if (typeof id !== "string") throw new BackendError(400,"invalid_track");
 if(await (await getDb()).getFirstAsync("SELECT id FROM service_media_retired WHERE id=?",id))throw new BackendError(404,"unknown_track");
 const track = (await getTracks()).find(track => track.id === id); if (track) return track;
 const row = await (await getDb()).getFirstAsync<{signature:string;payload:string}>("SELECT signature,payload FROM backend_source_tracks WHERE id=?",id);
 if (!row || row.signature !== signature(await loadNasSettings())) throw new BackendError(404,"unknown_track");
 return JSON.parse(row.payload);
}
export async function knownArtwork(): Promise<Set<string>> {
 const db = await getDb(), uris = new Set<string>();
 for (const [table, field] of [["tracks","cover_id"],["tracks","artwork_url"],["artists","cover_id"],["albums","cover_id"],["playlists","cover_url"],["playlist_tracks","cover_url"]]) for (const row of await db.getAllAsync<{uri:string}>(`SELECT DISTINCT ${field} AS uri FROM ${table} WHERE ${field} IS NOT NULL`)) uris.add(row.uri);
 const raw = await servicePreferences.getItem("nlc.track-meta.v2"); const row = raw ? {value:raw} : null;
 if(row) {try {for (const value of Object.values(JSON.parse(row.value)) as any[]) if (typeof value?.artworkUrl === "string") uris.add(value.artworkUrl);}catch{}}
 for (const row of await db.getAllAsync<{id:string}>("SELECT id FROM backend_resources WHERE kind IN ('artwork','cover')")) uris.add(row.id);
 return uris;
}
export async function validateArtworkInput(value: unknown): Promise<void> {
 const known = await knownArtwork();
 function visit(value:any, depth=0) { if(depth>20)return; if(typeof value === "string") {if (/^(file:|content:|data:|blob:)/i.test(value) && !known.has(value)) throw new BackendError(403,"unknown_artwork");} else if(Array.isArray(value)) value.forEach(item=>visit(item,depth+1)); else if(value && typeof value === "object") Object.values(value).forEach(item=>visit(item,depth+1)); }
 visit(value);
}
