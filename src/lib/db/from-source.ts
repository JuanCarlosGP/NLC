import type { MusicSource } from "@/lib/nas/types";

/** Returns true when the NAS answered; a failure means read SQLite offline-only. */
export async function nasScanOk(source: MusicSource): Promise<boolean> {
  try {
    await source.getAlbums();
    return true;
  } catch {
    return false;
  }
}
