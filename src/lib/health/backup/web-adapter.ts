import type { CatalogDb } from "../../db/types";
import { idbDone, idbResult } from "../web-database";
import { WEB_WEIGHT_KEY } from "../weight/web-store";
import { TRAINING_WEB_KEY } from "../training/web-store";
import { MEDICATION_WEB_KEY } from "../medication/web-store";
import { WEB_NUTRITION_KEY } from "../nutrition/web-store";
import { BackupError, photoList, assertPhotoBudget, validateHealthData, type BackupInfo, type HealthData } from "./model";
import type { BackupAdapter } from "./core";
import { readSqlHealth, writeSqlHealth, type SqlHealthState } from "./sql";
type Sql = { open(): Promise<CatalogDb>; transact(db: CatalogDb, task: () => Promise<void>): Promise<void> };
type Pending = { key: "pending"; previous: SqlHealthState };
export function createWebBackupAdapter(open: () => Promise<IDBDatabase>, storage: { getItem(key: string): Promise<string | null> }, sql?: Sql) {
  let recovered = false;
  async function pendingRecord() { const db = await open(); return idbResult<Pending | undefined>(db.transaction("maintenance", "readonly").objectStore("maintenance").get("pending")); }
  async function clearPending() { const db = await open(); const tx = db.transaction("maintenance", "readwrite"); const done = idbDone(tx); tx.objectStore("maintenance").delete("pending"); await done; }
  async function recover() {
    if (recovered) return;
    const pending = await pendingRecord();
    if (pending) {
      if (!sql) throw new BackupError("recovery");
      const db = await sql.open(); await sql.transact(db, () => writeSqlHealth(db, pending.previous, false)); await clearPending();
    }
    recovered = true;
  }
  async function localData(): Promise<HealthData> {
    if (sql) return (await readSqlHealth(await sql.open(), false)).data;
    const weight = await storage.getItem(WEB_WEIGHT_KEY), training = await storage.getItem(TRAINING_WEB_KEY), medication = await storage.getItem(MEDICATION_WEB_KEY), nutrition = await storage.getItem(WEB_NUTRITION_KEY);
    return { weights: weight ? JSON.parse(weight) : [], sessions: training ? JSON.parse(training).sessions : [], medication: medication ? JSON.parse(medication) : { plans: [], logs: [], alertsEnabled: false }, nutrition: nutrition ? JSON.parse(nutrition) : [], bodyReviews: [] };
  }
  async function recoveryRecord() { return idbResult<{ info: BackupInfo; archive: Blob } | undefined>((await open()).transaction("maintenance", "readonly").objectStore("maintenance").get("recovery")); }
  const adapter: BackupAdapter = {
    async read() {
      const data = await localData(); const db = await open();
      data.bodyReviews = await idbResult(db.transaction("reviews", "readonly").objectStore("reviews").getAll()); validateHealthData(data); assertPhotoBudget(data);
      const photos = new Map<string, Uint8Array>();
      for (const photo of photoList(data)) {
        const row = await idbResult(db.transaction("photos", "readonly").objectStore("photos").get(photo.id));
        if (!(row?.blob instanceof Blob)) throw new BackupError("missingPhoto"); photos.set(photo.id, new Uint8Array(await row.blob.arrayBuffer()));
      }
      return { data, photos };
    },
    async recoveryInfo() { return (await recoveryRecord())?.info ?? null; },
    async recoveryBytes() { const row = await recoveryRecord(); return row ? new Uint8Array(await row.archive.arrayBuffer()) : null; },
    async apply(target, recovery, info) {
      const db = await open(); let sqlDb: CatalogDb | null = null;
      if (sql) {
        recovered = false; sqlDb = await sql.open(); const previous = await readSqlHealth(sqlDb, false);
        const tx = db.transaction("maintenance", "readwrite"); const done = idbDone(tx); tx.objectStore("maintenance").put({ key: "pending", previous } satisfies Pending); await done;
      }
      try {
        if (sql && sqlDb) await sql.transact(sqlDb, () => writeSqlHealth(sqlDb!, { data: target.data, rest: null }, false));
        const tx = db.transaction(["reviews", "photos", "health-values", "maintenance"], "readwrite"); const done = idbDone(tx);
        try {
          tx.objectStore("reviews").clear(); tx.objectStore("photos").clear();
          for (const entry of target.data.bodyReviews) tx.objectStore("reviews").put(entry);
          for (const photo of photoList(target.data)) tx.objectStore("photos").put({ id: photo.id, blob: new Blob([new Uint8Array(target.photos.get(photo.id)!).buffer], { type: photo.mime }) });
          if (!sql) {
            const values = { [WEB_WEIGHT_KEY]: target.data.weights, [TRAINING_WEB_KEY]: { sessions: target.data.sessions, rest: null }, [MEDICATION_WEB_KEY]: target.data.medication, [WEB_NUTRITION_KEY]: target.data.nutrition };
            for (const [key, value] of Object.entries(values)) tx.objectStore("health-values").put({ key, value: JSON.stringify(value) });
          }
          tx.objectStore("maintenance").put({ key: "recovery", archive: new Blob([new Uint8Array(recovery).buffer], { type: "application/zip" }), info });
          tx.objectStore("maintenance").delete("pending"); await done;
        } catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
        recovered = true;
      } catch (error) {
        if (sql) { try { await recover(); } catch { throw new BackupError("recovery"); } }
        throw error;
      }
    },
  };
  return { adapter, recover };
}
