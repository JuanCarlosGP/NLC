import { createVideoDavClient } from "@/lib/video/dav";
import {
  isLocalVideoPath,
  listLocalVideoDir,
  localVideoPlayable,
} from "@/lib/local/local-video";
import type { NasSettings } from "@/lib/settings/storage";
import type { PlayableSource } from "@/lib/nas/types";
import type { WebDavEntry } from "@/lib/nas/webdav";

export function createVideoClient(settings: NasSettings, password: string) {
  const dav = createVideoDavClient(settings, password);
  const localUri = settings.videoLocalFolderUri.trim();

  async function listDir(path: string): Promise<WebDavEntry[]> {
    if (localUri && isLocalVideoPath(path)) return listLocalVideoDir(localUri, path);
    return dav.listDir(path);
  }

  function playable(path: string): PlayableSource | Promise<PlayableSource> {
    if (localUri && isLocalVideoPath(path)) return localVideoPlayable(localUri, path);
    return dav.playable(path);
  }

  return { listDir, playable, absolute: dav.absolute };
}
