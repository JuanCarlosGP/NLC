import { remoteEnabled } from "@/lib/backend/profile";
import { remoteMusicSource, remotePing } from "@/lib/backend/sources";
import { localCatalogSource } from "./local-catalog-source";
import { usesLocal, usesNas } from "@/lib/settings/service-source";
import { createLocalSource } from "@/lib/local/local-source";
import { composeSources } from "@/lib/nas/compose-source";
import { createOpenSubsonicSource } from "@/lib/nas/open-subsonic";
import { createWebDavSource, pingNasConnection as pingNasLogin } from "@/lib/nas/webdav-source";
import { mockSource } from "@/lib/nas/mock-source";
import type { MusicSource, PingResult } from "@/lib/nas/types";
import { t } from "@/lib/i18n/runtime";
import type { NasSettings } from "@/lib/settings/storage.impl";

export function createMusicSource(settings: NasSettings, password: string): MusicSource {
  if (remoteEnabled) return remoteMusicSource;
  const hasPodcastLocal = Boolean(usesLocal(settings, "podcast") && settings.podcastLocalFolderUri);
  const musicLocal = usesLocal(settings, "music") && settings.localFolderUri
    ? createLocalSource(settings.localFolderUri, { skipPodcasts: hasPodcastLocal || !usesLocal(settings, "podcast") })
    : null;
  const podcastLocal = hasPodcastLocal
    ? createLocalSource(settings.podcastLocalFolderUri, { asPodcast: true, idPrefix: "localpod" })
    : null;
  let base: MusicSource = settings.sourceKind === "mock" ? mockSource : localCatalogSource;
  if (usesNas(settings, "music") && settings.sourceKind === "opensubsonic") {
    base = createOpenSubsonicSource(settings, password);
  } else if (settings.sourceKind !== "mock" && (usesNas(settings, "music") || usesNas(settings, "podcast")) && settings.host.trim()) {
    base = createWebDavSource({ ...settings,
      sharePath: usesNas(settings, "music") ? settings.sharePath : "",
      podcastSharePath: usesNas(settings, "podcast") ? settings.podcastSharePath : "",
    }, password);
  }
  if (base.kind === "webdav" || base.kind === "opensubsonic") base = composeSources(base, localCatalogSource);
  if (musicLocal && settings.sourceKind !== "mock") base = composeSources(base, musicLocal);
  else if (musicLocal && settings.sourceKind === "mock") base = composeSources(localCatalogSource, musicLocal);
  if (podcastLocal) base = composeSources(base, podcastLocal);
  return base;
}

async function withNasTimeout(work: Promise<PingResult>): Promise<PingResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(t("nas.timeout"))), 15_000);
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
  if (remoteEnabled) return remotePing(settings, password);
  return withNasTimeout(createMusicSource(settings, password).ping());
}

/** Host + user + password. Does not look at music / podcast / video paths. */
export async function pingNasConnection(settings: NasSettings, password: string): Promise<PingResult> {
  if (remoteEnabled) return remotePing(settings, password);
  return withNasTimeout(pingNasLogin(settings, password));
}
