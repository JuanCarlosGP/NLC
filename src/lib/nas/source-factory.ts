import { createLocalSource } from "@/lib/local/local-source";
import { composeSources } from "@/lib/nas/compose-source";
import { createOpenSubsonicSource } from "@/lib/nas/open-subsonic";
import { createWebDavSource, pingNasConnection as pingNasLogin } from "@/lib/nas/webdav-source";
import { mockSource } from "@/lib/nas/mock-source";
import type { MusicSource, PingResult } from "@/lib/nas/types";
import { t } from "@/lib/i18n/runtime";
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

async function withNasTimeout(work: Promise<PingResult>): Promise<PingResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(t("nas.timeout"))), 10_000);
    });
    return await Promise.race([work, timeout]);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : t("nas.connectFail"),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function pingMusicSource(settings: NasSettings, password: string): Promise<PingResult> {
  return withNasTimeout(createMusicSource(settings, password).ping());
}

/** Host + user + password. Does not look at music / podcast / video paths. */
export async function pingNasConnection(settings: NasSettings, password: string): Promise<PingResult> {
  return withNasTimeout(pingNasLogin(settings, password));
}
