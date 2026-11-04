import { Platform } from "react-native";
import { readAndroidBackupFile, writeAndroidBackupFile } from "./native-files";
import { openIsolatedHealthDb } from "@/lib/db/sqlite-client";
import type { CatalogDb } from "@/lib/db/types";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { runInTransaction } from "@/lib/db/client";
import { validBodyId, photoExtension, type BodyPhoto } from "../body-photos/model";
import { BackupError, MAX_BACKUP_BYTES } from "./model";
import { createNativeBackupAdapter } from "./native-adapter";
import { decodeBase64, encodeBase64 } from "./base64";
function photoUri(photo: BodyPhoto) { if (!validBodyId(photo.id)) throw new BackupError("format"); return `${FileSystem.documentDirectory}health-body-photos/${photo.id}.${photoExtension(photo.mime)}`; }
function recoveryUri(ref: string) { if (!validBodyId(ref)) throw new BackupError("format"); return `${FileSystem.documentDirectory}health-backup/${ref}.zip`; }
async function read(uri: string, limit: number) { if (Platform.OS === "android") return readAndroidBackupFile(uri, limit); const info = await FileSystem.getInfoAsync(uri); if (!info.exists || info.isDirectory) throw new BackupError("missingPhoto"); if (info.size > limit) throw new BackupError("size"); return decodeBase64(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })); }
async function write(uri: string, bytes: Uint8Array) { await FileSystem.makeDirectoryAsync(uri.slice(0, uri.lastIndexOf("/")), { intermediates: true }); if (Platform.OS === "android") await writeAndroidBackupFile(uri, bytes); else await FileSystem.writeAsStringAsync(uri, encodeBase64(bytes), { encoding: FileSystem.EncodingType.Base64 }); const info = await FileSystem.getInfoAsync(uri); if (!info.exists || info.isDirectory || info.size !== bytes.length) throw new BackupError("storage"); }
export const newBackupId = () => Crypto.randomUUID();
let connection: Promise<CatalogDb> | null = null;
const open = () => connection ??= openIsolatedHealthDb().catch((error) => { connection = null; throw error; });
export const backupAdapter = createNativeBackupAdapter(open, runInTransaction, {
  read: (photo) => read(photoUri(photo), photo.bytes), write: (photo, bytes) => write(photoUri(photo), bytes), remove: (photo) => FileSystem.deleteAsync(photoUri(photo), { idempotent: true }),
  readRecovery: (ref) => read(recoveryUri(ref), MAX_BACKUP_BYTES), writeRecovery: (ref, bytes) => write(recoveryUri(ref), bytes), removeRecovery: (ref) => FileSystem.deleteAsync(recoveryUri(ref), { idempotent: true }),
}, newBackupId);
