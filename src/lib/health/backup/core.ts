import { decodeBackup, encodeBackup, type HashBytes } from "./archive";
import { BackupError, backupInfo, photoList, remapPhotos, type BackupInfo, type DecodedBackup, type HealthSnapshot } from "./model";
export type BackupAdapter = {
  read(): Promise<HealthSnapshot>;
  apply(target: DecodedBackup, recovery: Uint8Array, info: BackupInfo, receipt?: {id:string;result:unknown}): Promise<void>;
  recoveryInfo(): Promise<BackupInfo | null>;
  recoveryBytes(): Promise<Uint8Array | null>;
};
export function createHealthBackup(adapter: BackupAdapter, hash: HashBytes, exclusive: <T>(task: () => Promise<T>) => Promise<T>, newId: () => string, now = () => new Date().toISOString()) {
  return {
    inspect: async (bytes: Uint8Array) => { const decoded = await decodeBackup(bytes, hash); return backupInfo(decoded.data, decoded.createdAt, bytes.length); },
    currentInfo: () => exclusive(async () => { const snapshot = await adapter.read(); return backupInfo(snapshot.data, now(), 0); }),
    export: () => exclusive(async () => { const snapshot = await adapter.read(); const createdAt = now(); const bytes = await encodeBackup(snapshot, hash, createdAt); return { bytes, info: backupInfo(snapshot.data, createdAt, bytes.length) }; }),
    restore: (bytes: Uint8Array, beforeApply?: () => Promise<void>, receiptId?: string) => exclusive(async () => {
      // Revalidate on confirmation rather than trusting a mutable preview object.
      const decoded = await decodeBackup(bytes, hash); const previous = await adapter.read(); const createdAt = now();
      const recovery = await encodeBackup(previous, hash, createdAt);
      const used = new Set([...photoList(previous.data), ...photoList(decoded.data)].map((photo) => photo.id));
      function freshId() { for (let i = 0; i < 100; i++) { const id = newId(); if (!used.has(id)) { used.add(id); return id; } } throw new BackupError("storage"); }
      const data = remapPhotos(decoded.data, freshId); const mapped = new Map<string, Uint8Array>();
      const originals = photoList(decoded.data), replacements = photoList(data);
      replacements.forEach((photo, index) => mapped.set(photo.id, decoded.photos.get(originals[index].id)!));
      const info = backupInfo(previous.data, createdAt, recovery.length);
      await beforeApply?.();
      const result = { restored: backupInfo(data, decoded.createdAt, bytes.length), recovery: info };
      await adapter.apply({ data, photos: mapped, createdAt: decoded.createdAt }, recovery, info, receiptId ? {id:receiptId,result} : undefined);
      return result;
    }),
    recoveryInfo: () => exclusive(() => adapter.recoveryInfo()),
    recoveryBytes: () => exclusive(() => adapter.recoveryBytes()),
  };
}
