import { createOpenSubsonicSource } from "@/lib/nas/open-subsonic";
import { createWebDavSource } from "@/lib/nas/webdav-source";
import { mockSource } from "@/lib/nas/mock-source";
import type { MusicSource } from "@/lib/nas/types";
import type { NasSettings } from "@/lib/settings/storage";

export function createMusicSource(settings: NasSettings, password: string): MusicSource {
  if (settings.sourceKind === "opensubsonic") {
    return createOpenSubsonicSource(settings, password);
  }
  if (settings.sourceKind === "webdav") {
    return createWebDavSource(settings, password);
  }
  return mockSource;
}
