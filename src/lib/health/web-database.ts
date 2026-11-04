export function createHealthWebDatabase(name: string, legacy: { getItem(key: string): Promise<string | null> }) {
  let opened: Promise<IDBDatabase> | null = null;
  function open(): Promise<IDBDatabase> {
    if (!opened) opened = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2); let abandoned = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("reviews")) db.createObjectStore("reviews", { keyPath: "id" }).createIndex("date", "date", { unique: true });
        if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
        if (!db.objectStoreNames.contains("health-values")) db.createObjectStore("health-values", { keyPath: "key" });
        if (!db.objectStoreNames.contains("maintenance")) db.createObjectStore("maintenance", { keyPath: "key" });
      };
      request.onsuccess = () => { const db = request.result; if (abandoned) { db.close(); return; } db.onversionchange = () => { db.close(); opened = null; }; resolve(db); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { abandoned = true; reject(new Error("Health database upgrade blocked")); };
    }).catch((error) => { opened = null; throw error; });
    return opened;
  }
  const storage = {
    async getItem(key: string): Promise<string | null> {
      const db = await open(); const current = await idbResult<{ key: string; value: string | null } | undefined>(db.transaction("health-values", "readonly").objectStore("health-values").get(key));
      if (current) return current.value;
      // Import the old AsyncStorage value once. Keep its original as a migration fallback.
      const value = await legacy.getItem(key); const tx = db.transaction("health-values", "readwrite"); const done = idbDone(tx);
      const store = tx.objectStore("health-values"); const again = store.get(key);
      again.onsuccess = () => { if (!again.result) store.put({ key, value }); };
      await done;
      return (await idbResult<{ value: string | null }>(db.transaction("health-values", "readonly").objectStore("health-values").get(key))).value;
    },
    async setItem(key: string, value: string) { const db = await open(); const tx = db.transaction("health-values", "readwrite"); const done = idbDone(tx); tx.objectStore("health-values").put({ key, value }); await done; },
  };
  return { open, storage };
}
export function idbResult<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
export function idbDone(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error ?? new Error("Health transaction aborted")); transaction.onerror = () => reject(transaction.error); }); }
