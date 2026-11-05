import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend, mediaUrl } from "@/lib/backend/remote";
import { usesNas, usesLocal } from "@/lib/settings/service-source";
import { createVideoDavClient } from "@/lib/video/dav";
import {
  isLocalVideoPath,
  listLocalVideoDir,
  localVideoPlayable,
} from "@/lib/local/local-video";
import type { NasSettings } from "@/lib/settings/storage.impl";
import type { PlayableSource } from "@/lib/nas/types";
import type { WebDavEntry } from "@/lib/nas/webdav";

export function createVideoClient(settings: NasSettings, password: string) {
  if (remoteEnabled) return { listDir: (path: string) => browserBackend.invoke<WebDavEntry[]>("video.list", [path], { domain: "video" }), playable: (path: string) => mediaUrl("video", path), absolute: (path: string) => mediaUrl("video", path) };
  const dav = createVideoDavClient(settings, password);
  const localUri = usesLocal(settings, "video") ? settings.videoLocalFolderUri.trim() : "";

  async function listDir(path: string): Promise<WebDavEntry[]> {
    if (localUri && isLocalVideoPath(path)) return listLocalVideoDir(localUri, path);
    if (!usesNas(settings, "video")) return [];
    return dav.listDir(path);
  }

  function playable(path: string): PlayableSource | Promise<PlayableSource> {
    if (localUri && isLocalVideoPath(path)) return localVideoPlayable(localUri, path);
    if (!usesNas(settings, "video")) throw new Error("localFileMissing");
    return dav.playable(path);
  }

  return { listDir, playable, absolute: dav.absolute };
}
