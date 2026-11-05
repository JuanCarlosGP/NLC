import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { createDavTransport, ensureWebDavDir } from "@/lib/nas/webdav-source";
import { joinPath } from "@/lib/nas/webdav";
import type { NasSettings } from "@/lib/settings/storage.impl";
export async function pickServiceBackup() {
  const picker = await import("expo-document-picker");
  const result = await picker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: false,
    multiple: false,
  });
  return result.canceled ? null : result.assets[0];
}
export async function backupDestination(name: string, folder?: string) {
  let uri = folder;
  if (!uri) {
    const result =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) return null;
    uri = result.directoryUri;
  }
  return FileSystem.StorageAccessFramework.createFileAsync(
    uri,
    name,
    "application/zip",
  );
}
export async function pickBackupDestinationFolder() {
  const result =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  return result.granted ? result.directoryUri : null;
}
export function backupName(service: string) {
  return `nlc-${service}-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
}
export function tempArchiveUri() {
  if (!FileSystem.cacheDirectory) throw new Error("storage");
  return `${FileSystem.cacheDirectory}nlc-service-${Crypto.randomUUID()}.zip`;
}
export async function removeArchiveFile(uri: string) {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
function healthTransport(settings: NasSettings, password: string) {
  if (!settings.healthSharePath?.trim() || !settings.host.trim())
    throw new Error("destination");
  return createDavTransport(
    { ...settings, sharePath: settings.healthSharePath },
    password,
  );
}
export async function saveHealthNas(
  uri: string,
  settings: NasSettings,
  password: string,
) {
  await ensureWebDavDir(settings, password, settings.healthSharePath ?? "");
  const transport = healthTransport(settings, password);
  const path = joinPath(settings.healthSharePath!, "nlc-health.zip");
  const probe = await transport.davFetch(
    `${settings.healthSharePath!.replace(/\/+$/, "")}/`,
    { method: "PROPFIND", headers: { Depth: "0" } },
  );
  await probe.text();
  if (!probe.ok) throw new Error("sourceUnreadable");
  const url = transport.absolute(path);
  const result = await FileSystem.uploadAsync(url, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: transport.session.authorization("PUT", url),
      "Content-Type": "application/zip",
    },
  });
  if (result.status < 200 || result.status >= 300)
    throw new Error("sourceUnreadable");
}
export async function loadHealthNas(settings: NasSettings, password: string) {
  const transport = healthTransport(settings, password);
  const path = joinPath(settings.healthSharePath!, "nlc-health.zip");
  const probe = await transport.davFetch(path, { method: "HEAD" });
  await probe.text();
  if (!probe.ok) throw new Error("sourceUnreadable");
  const url = transport.absolute(path);
  const uri = tempArchiveUri();
  try {
    const result = await FileSystem.downloadAsync(url, uri, {
      headers: { Authorization: transport.session.authorization("GET", url) },
    });
    if (result.status < 200 || result.status >= 300)
      throw new Error("sourceUnreadable");
    return uri;
  } catch (error) {
    await removeArchiveFile(uri);
    throw error;
  }
}
