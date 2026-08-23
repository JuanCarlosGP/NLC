import {
  getTrackArtworkUrl,
  hydrateTrackArtworkCache,
} from "@/lib/library/artwork-cache";
import type { Track } from "@/lib/nas/types";

/** Remote art only — data: URIs crash expo-audio's Android URL parser and kill the session. */
export function lockScreenArtworkUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  return undefined;
}

export function lockScreenMetadata(track: Track, artworkUrl?: string | null) {
  return {
    title: track.title,
    artist: track.artistName,
    albumTitle: track.albumName,
    artworkUrl: lockScreenArtworkUrl(artworkUrl ?? track.artworkUrl),
  };
}

export const LOCK_SCREEN_OPTIONS = {
  showSeekForward: false,
  showSeekBackward: false,
  showNextTrack: true,
  showPreviousTrack: true,
};

export async function resolveLockScreenArtwork(track: Track): Promise<string | undefined> {
  const immediate = lockScreenArtworkUrl(track.artworkUrl);
  if (immediate) return immediate;
  try {
    await hydrateTrackArtworkCache();
  } catch {
    // Cache is best-effort.
  }
  return lockScreenArtworkUrl(getTrackArtworkUrl(track.id));
}
