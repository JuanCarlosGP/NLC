import { t } from "@/lib/i18n/runtime";
import { Platform } from "react-native";

export type PickedFolder = {
  uri: string;
  name: string;
};

export type WebDirHandle = {
  getDirectoryHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<WebDirHandle>;
  name: string;
  kind: "directory";
  values: () => AsyncIterable<
    {
      name: string;
      kind: "file" | "directory";
      getFile?: () => Promise<File>;
    } & WebDirHandle
  >;
};

const webHandles = new Map<string, WebDirHandle>();

export function getWebDirectoryHandle(uri: string): WebDirHandle | null {
  return webHandles.get(uri) ?? null;
}

export function registerWebDirectoryHandle(
  handle: WebDirHandle,
  uri: string,
): string {
  webHandles.set(uri, handle);
  return uri;
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

export async function pickLocalFolder(
  options: { writable?: boolean } = {},
): Promise<PickedFolder | null> {
  if (Platform.OS === "web") {
    const picker = (
      globalThis as {
        showDirectoryPicker?: (options?: {
          mode: "read" | "readwrite";
        }) => Promise<WebDirHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      throw new Error(t("nasExtra.browserNoFolders"));
    }
    try {
      const handle = await picker({
        mode: options.writable ? "readwrite" : "read",
      });
      const uri = `webdir:${handle.name}`;
      webHandles.set(uri, handle);
      return { uri, name: handle.name };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return null;
      throw error;
    }
  }
  if (Platform.OS !== "android") {
    throw new Error(t("nasExtra.foldersOnPhone"));
  }
  const { StorageAccessFramework } = await import("expo-file-system/legacy");
  const result =
    await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!result.granted) return null;
  return { uri: result.directoryUri, name: nameFromUri(result.directoryUri) };
}

export function folderDisplayName(uri: string, storedName?: string): string {
  if (storedName?.trim()) return storedName.trim();
  if (!uri) return "";
  return nameFromUri(uri);
}
