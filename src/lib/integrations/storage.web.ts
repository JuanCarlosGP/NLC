import type { CacheStorage } from "./cache";
import { localDemoEnabled } from "@/lib/dev/local-demo";
let opened: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> { return opened ??= new Promise((resolve,reject) => {
  const request = indexedDB.open(localDemoEnabled ? "nlc-integrations-demo-v1" : "nlc-integrations-v1",1);
  request.onupgradeneeded = () => request.result.createObjectStore("cache");
  request.onerror = () => { opened = null; reject(request.error); };
  request.onblocked = () => { opened = null; reject(new Error("storage")); };
  request.onsuccess = () => { const db=request.result; db.onversionchange=()=>{db.close();opened=null;}; resolve(db); };
}); }
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> { const db=await open(); return new Promise((resolve,reject)=>{const tx=db.transaction("cache",mode);const request=action(tx.objectStore("cache")); tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error ?? new Error("storage"));tx.onerror=()=>{};}); }
export const integrationStorage: CacheStorage = {
  async getItem(key) { return (await transaction("readonly",store=>store.get(key))) ?? null; },
  async setItem(key,value) { await transaction("readwrite",store=>store.put(value,key)); },
  async removeItem(key) { await transaction("readwrite",store=>store.delete(key)); },
};
