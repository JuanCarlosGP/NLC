import { readAndroidBackupFile, writeAndroidBackupFile } from "./native-files";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { requireOptionalNativeModule } from "expo-modules-core";
import { BackupError, MAX_BACKUP_BYTES } from "./model";
import { decodeBase64, encodeBase64 } from "./base64";
export async function pickHealthBackup(): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (!requireOptionalNativeModule("ExpoDocumentPicker")) throw new BackupError("nativeUpdate");
  const picker = await import("expo-document-picker");
  const result = await picker.getDocumentAsync({ type: "*/*", multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = result.assets[0];
  try {
    const info = await FileSystem.getInfoAsync(file.uri); if (!info.exists || info.isDirectory) throw new BackupError("format"); if (info.size > MAX_BACKUP_BYTES) throw new BackupError("size");
    return { name: file.name, bytes: Platform.OS === "android" ? await readAndroidBackupFile(file.uri, MAX_BACKUP_BYTES) : decodeBase64(await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 })) };
  } finally { if (FileSystem.cacheDirectory && file.uri.startsWith(`${FileSystem.cacheDirectory}DocumentPicker/`)) await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {}); }
}
export async function saveHealthBackup(bytes: Uint8Array, name: string): Promise<boolean> {
  if (Platform.OS === "android") {
    const directory = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(); if (!directory.granted) return false;
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(directory.directoryUri, name, "application/zip");
    try { await writeAndroidBackupFile(uri, bytes); return true; }
    catch (error) { await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); throw error; }
  }
  if (!requireOptionalNativeModule("ExpoSharing")) throw new BackupError("nativeUpdate");
  const sharing = await import("expo-sharing"); if (!(await sharing.isAvailableAsync()) || !FileSystem.cacheDirectory) throw new BackupError("storage");
  const uri = `${FileSystem.cacheDirectory}${name}`;
  try { await FileSystem.writeAsStringAsync(uri, encodeBase64(bytes), { encoding: FileSystem.EncodingType.Base64 }); await sharing.shareAsync(uri, { mimeType: "application/zip", UTI: "public.zip-archive" }); return true; }
  finally { await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); }
}
