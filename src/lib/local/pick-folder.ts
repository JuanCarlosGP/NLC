import { t } from "@/lib/i18n/runtime";
import { Platform } from "react-native";

export type PickedFolder = {
  uri: string;
  name: string;
};

type WebDirHandle = {
  name: string;
  kind: "directory";
  values: () => AsyncIterable<{ name: string; kind: "file" | "directory"; getFile?: () => Promise<File> } & WebDirHandle>;
};

const webHandles = new Map<string, WebDirHandle>();

export function getWebDirectoryHandle(uri: string): WebDirHandle | null {
  return webHandles.get(uri) ?? null;
}

function nameFromUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const tail = decoded.split("/").pop() ?? decoded;
    return tail.replace(/^.*:/, "") || t("nasExtra.folderFallback");
  } catch {
    return t("nasExtra.folderFallback");
  }
}

export async function pickLocalFolder(): Promise<PickedFolder | null> {
  if (Platform.OS === "web") {
    const picker = (globalThis as { showDirectoryPicker?: () => Promise<WebDirHandle> }).showDirectoryPicker;
    if (!picker) {
      throw new Error(t("nasExtra.browserNoFolders"));
    }
    const handle = await picker();
    const uri = `webdir:${handle.name}`;
    webHandles.set(uri, handle);
    return { uri, name: handle.name };
  }
  if (Platform.OS !== "android") {
    throw new Error(t("nasExtra.foldersOnPhone"));
  }
  const { StorageAccessFramework } = await import("expo-file-system/legacy");
  const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!result.granted) return null;
  return { uri: result.directoryUri, name: nameFromUri(result.directoryUri) };
}

export function folderDisplayName(uri: string, storedName?: string): string {
  if (storedName?.trim()) return storedName.trim();
  if (!uri) return "";
  return nameFromUri(uri);
}
