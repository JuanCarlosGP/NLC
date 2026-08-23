import { createLocalSource } from "@/lib/local/local-source";
import { composeSources } from "@/lib/nas/compose-source";
import { createOpenSubsonicSource } from "@/lib/nas/open-subsonic";
import { createWebDavSource } from "@/lib/nas/webdav-source";
import { mockSource } from "@/lib/nas/mock-source";
import type { MusicSource } from "@/lib/nas/types";
import type { NasSettings } from "@/lib/settings/storage";

export function createMusicSource(settings: NasSettings, password: string): MusicSource {
  const hasPodcastLocal = Boolean(settings.podcastLocalFolderUri);
  const musicLocal = settings.localFolderUri
    ? createLocalSource(settings.localFolderUri, { skipPodcasts: hasPodcastLocal })
    : null;
  const podcastLocal = hasPodcastLocal
    ? createLocalSource(settings.podcastLocalFolderUri, { asPodcast: true, idPrefix: "localpod" })
    : null;
  let base: MusicSource = mockSource;
  if (settings.sourceKind === "opensubsonic") {
    base = createOpenSubsonicSource(settings, password);
  } else if (settings.sourceKind === "webdav") {
    base = createWebDavSource(settings, password);
  }
  if (musicLocal && settings.sourceKind !== "mock") base = composeSources(base, musicLocal);
  else if (musicLocal && settings.sourceKind === "mock") base = musicLocal;
  if (podcastLocal) base = composeSources(base, podcastLocal);
  return base;
}
