import type { CatalogDb } from "@/lib/db/types";
const KEY = "nlc.media-remap.v1";
type Mapping = Record<string,string>;
const listeners = new Set<(ids: Mapping, uris: Mapping) => Promise<void>>();
export const onMediaRemap = (fn: (ids:Mapping,uris:Mapping)=>Promise<void>) => {listeners.add(fn);return ()=>{listeners.delete(fn);};};
export async function saveMediaRemap(db:CatalogDb, ids:Mapping, uris:Mapping) {
 const previous = await readMediaRemap(db);
 for(const kind of ["ids","uris"] as const) {
  const next = kind==="ids"?ids:uris;
  for(const key of Object.keys(previous[kind])) previous[kind][key]=next[previous[kind][key]]??previous[kind][key];
  Object.assign(previous[kind],next);
 }
 await db.runAsync("INSERT OR REPLACE INTO meta(key,value) VALUES (?,?)",KEY,JSON.stringify(previous));
}
export async function readMediaRemap(db:CatalogDb):Promise<{ids:Mapping;uris:Mapping}> {
 const row=await db.getFirstAsync<{value:string}>("SELECT value FROM meta WHERE key=?",KEY);
 return row?JSON.parse(row.value):{ids:{},uris:{}};
}
export async function notifyMediaRemap(ids:Mapping,uris:Mapping) {await Promise.all([...listeners].map(fn=>fn(ids,uris)));}
