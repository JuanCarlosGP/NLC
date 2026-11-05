import type { CatalogDb } from "../../db/types";
import type { BodyPhoto } from "../body-photos/model";
import { BackupError, photoList, assertPhotoBudget, validateHealthData, type BackupInfo } from "./model";
import { readSqlHealth, writeSqlHealth } from "./sql";
import type { BackupAdapter } from "./core";
export type BackupFiles = {
  read(photo: BodyPhoto): Promise<Uint8Array>; write(photo: BodyPhoto, bytes: Uint8Array): Promise<void>; remove(photo: BodyPhoto): Promise<void>;
  readRecovery(ref: string): Promise<Uint8Array>; writeRecovery(ref: string, bytes: Uint8Array): Promise<void>; removeRecovery(ref: string): Promise<void>;
};
export const RECOVERY_KEY = "health_backup_recovery_v1";
export function createNativeBackupAdapter(open: () => Promise<CatalogDb>, transact: (db: CatalogDb, task: () => Promise<void>) => Promise<void>, files: BackupFiles, newId: () => string): BackupAdapter {
  async function record() { const row = await (await open()).getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", RECOVERY_KEY); return row ? JSON.parse(row.value) as { ref: string; info: BackupInfo } : null; }
  return {
    async read() { const { data } = await readSqlHealth(await open()); validateHealthData(data); assertPhotoBudget(data); const photos = new Map<string, Uint8Array>(); for (const photo of photoList(data)) photos.set(photo.id, await files.read(photo)); return { data, photos }; },
    async recoveryInfo() { return (await record())?.info ?? null; },
    async recoveryBytes() { const previous = await record(); return previous ? files.readRecovery(previous.ref) : null; },
    async apply(target, recovery, info, receipt) {
      const db = await open(); const previous = await readSqlHealth(db); const oldRecord = await record(); const ref = newId(); if (ref === oldRecord?.ref) throw new BackupError("storage"); const created: BodyPhoto[] = [];
      try {
        for (const photo of photoList(target.data)) { created.push(photo); await files.write(photo, target.photos.get(photo.id)!); }
        await files.writeRecovery(ref, recovery);
        await transact(db, async () => { await writeSqlHealth(db, { data: target.data, rest: null }); if(receipt)await db.runAsync("INSERT OR REPLACE INTO meta(key,value) VALUES (?,?)",`health_remote_restore:${receipt.id}`,JSON.stringify(receipt.result)); await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", RECOVERY_KEY, JSON.stringify({ ref, info })); });
      } catch (error) {
        await Promise.all(created.map((photo) => files.remove(photo).catch(() => {}))); await files.removeRecovery(ref).catch(() => {}); throw error;
      }
      // A durable, referenced ZIP holds the old photos before their working copies are cleaned.
      await Promise.all(photoList(previous.data).map((photo) => files.remove(photo).catch(() => {})));
      if (oldRecord) await files.removeRecovery(oldRecord.ref).catch(() => {});
    },
  };
}
