import type { MusicSource, Track } from "@/lib/nas/types";
import { isPodcastTrack } from "@/lib/nas/webdav";
import { getTrackArtworkUrl } from "@/lib/library/artwork-cache";
import type { ImportedPlaylist } from "@/lib/spotify/types";

const pending = new Set<string>();
const finished = new Set<string>();
let writeDenied = false;
let chain: Promise<void> = Promise.resolve();

function enqueue(job: () => Promise<void>): void {
  chain = chain.then(job, job);
}

export function persistTrackCovers(
  source: MusicSource,
  items: Array<{ trackId?: string | null; url?: string | null; coverId?: string | null }>,
): void {
  if (!source.ensureCoverSidecar || writeDenied) return;
  const jobs = items.filter((item) => {
    const id = item.trackId?.trim();
    const url = item.url?.trim();
    if (!id || !url || !id.startsWith("/")) return false;
    if (item.coverId) return false;
    if (finished.has(id) || pending.has(id)) return false;
    return true;
  });
  if (!jobs.length) return;

  enqueue(async () => {
    for (const item of jobs) {
      const id = item.trackId!.trim();
      const url = item.url!.trim();
      if (writeDenied || finished.has(id)) continue;
      pending.add(id);
      try {
        const saved = await source.ensureCoverSidecar?.(id, url);
        if (saved) finished.add(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/permiso de escritura|no permite/i.test(message)) {
          writeDenied = true;
          break;
        }
      } finally {
        pending.delete(id);
      }
    }
  });
}

export function persistPlaylistCovers(source: MusicSource, playlists: ImportedPlaylist[]): void {
  persistTrackCovers(
    source,
    playlists.flatMap((playlist) =>
      playlist.tracks
        .filter((track) => track.matched?.id && track.coverUrl)
        .map((track) => ({
          trackId: track.matched!.id,
          url: track.coverUrl,
          coverId: track.matched!.coverId,
        })),
    ),
  );
}

export function persistLibraryCovers(source: MusicSource, tracks: Track[]): void {
  persistTrackCovers(
    source,
    tracks
      .filter((track) => !isPodcastTrack(track))
      .map((track) => ({
        trackId: track.id,
        url: track.artworkUrl || getTrackArtworkUrl(track.id),
        coverId: track.coverId,
      })),
  );
}
