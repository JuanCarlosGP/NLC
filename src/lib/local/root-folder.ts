import { Platform } from "react-native";
import {
  folderDisplayName,
  getWebDirectoryHandle,
  registerWebDirectoryHandle,
  type PickedFolder,
} from "./pick-folder";
import { SERVICES, withLocalFolder } from "@/lib/settings/service-source";
import type { NasSettings, ServiceId } from "@/lib/settings/storage.impl";

// Stable names: changing the app language must not create a second set of folders.
export const SERVICE_FOLDER_NAMES: Record<ServiceId, string> = {
  music: "Music",
  podcast: "Podcasts",
  video: "Video",
  focus: "Tasks",
  wealth: "Wealth",
  health: "Health",
};

export async function prepareLocalRoot(
  settings: NasSettings,
  root: PickedFolder,
): Promise<NasSettings> {
  const folders = new Map<ServiceId, string>();
  if (Platform.OS === "web") {
    const handle = getWebDirectoryHandle(root.uri);
    if (!handle) throw new Error("rootFolder");
    for (const service of SERVICES) {
      const name = SERVICE_FOLDER_NAMES[service];
      const child = await handle.getDirectoryHandle(name, { create: true });
      folders.set(
        service,
        registerWebDirectoryHandle(child, `${root.uri}/${name}`),
      );
    }
  } else if (Platform.OS === "android") {
    // Physical phone/SD storage exposes path-based document IDs. Other providers may
    // expose opaque IDs which cannot be matched safely with the legacy folder API.
    if (
      !root.uri.startsWith(
        "content://com.android.externalstorage.documents/tree/",
      )
    )
      throw new Error("rootFolder");
    const { StorageAccessFramework: saf } = await import(
      "expo-file-system/legacy"
    );
    const children = await saf.readDirectoryAsync(root.uri);
    for (const service of SERVICES) {
      const name = SERVICE_FOLDER_NAMES[service];
      const matches = children.filter(
        (uri) => folderDisplayName(uri).toLowerCase() === name.toLowerCase(),
      );
      if (matches.length > 1) throw new Error("rootFolder");
      if (matches[0]) {
        await saf.readDirectoryAsync(matches[0]); // A file with the same name is a conflict.
        folders.set(service, matches[0]);
      }
    }
    for (const service of SERVICES) {
      if (!folders.has(service))
        folders.set(
          service,
          await saf.makeDirectoryAsync(root.uri, SERVICE_FOLDER_NAMES[service]),
        );
    }
  } else throw new Error("rootFolder");
  // Commit the draft only after every service has a usable folder. On failure,
  // any empty folders just created can be reused by a retry; no user files are removed.
  let next: NasSettings = {
    ...settings,
    localRootFolderUri: root.uri,
    localRootFolderName: root.name,
  };
  for (const service of SERVICES)
    next = withLocalFolder(
      next,
      service,
      folders.get(service)!,
      `${root.name}/${SERVICE_FOLDER_NAMES[service]}`,
    );
  return next;
}
