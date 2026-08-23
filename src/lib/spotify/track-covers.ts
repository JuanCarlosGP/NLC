import { Platform } from "react-native";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";

const TRACK_ID = /^[a-zA-Z0-9]{22}$/;
const CONCURRENCY = 6;
const MAX_IDS = 120;

export function isSpotifyTrackId(id: string): boolean {
  return TRACK_ID.test(id);
}

export function trackNeedsCover(track: ImportedTrack, playlistCover?: string | null): boolean {
  if (!isSpotifyTrackId(track.spotifyId)) return false;
  if (!track.coverUrl) return true;
  return Boolean(playlistCover && track.coverUrl === playlistCover);
}

export function playlistNeedsCovers(playlist: Pick<ImportedPlaylist, "kind" | "coverUrl" | "tracks">): boolean {
  if (playlist.kind === "album" || playlist.kind === "local") return false;
  return playlist.tracks.some((track) => trackNeedsCover(track, playlist.coverUrl));
}

export function applyCoverMap(tracks: ImportedTrack[], covers: Record<string, string>): ImportedTrack[] {
  if (!Object.keys(covers).length) return tracks;
  return tracks.map((track) => {
    const coverUrl = covers[track.spotifyId];
    return coverUrl && coverUrl !== track.coverUrl ? { ...track, coverUrl } : track;
  });
}

async function fetchOembedCover(id: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${id}`)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { thumbnail_url?: string };
    return payload.thumbnail_url ?? null;
  } catch {
    return null;
  }
}

export async function fetchTrackCoverMap(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(isSpotifyTrackId))].slice(0, MAX_IDS);
  const covers: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (id) => [id, await fetchOembedCover(id)] as const));
    for (const [id, url] of results) {
      if (url) covers[id] = url;
    }
  }
  return covers;
}

async function fetchCoverMapInBrowser(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(isSpotifyTrackId))].slice(0, MAX_IDS);
  if (!unique.length) return {};
  try {
    const response = await fetch("/api/spotify-covers", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unique }),
    });
    if (!response.ok) return fetchTrackCoverMap(unique);
    const payload = (await response.json()) as { covers?: Record<string, string> };
    return payload.covers ?? {};
  } catch {
    return fetchTrackCoverMap(unique);
  }
}

export async function loadTrackCoverMap(ids: string[]): Promise<Record<string, string>> {
  const inBrowser = Platform.OS === "web" && typeof window !== "undefined";
  return inBrowser ? fetchCoverMapInBrowser(ids) : fetchTrackCoverMap(ids);
}

export async function hydrateTrackCovers(
  tracks: ImportedTrack[],
  playlistCover?: string | null,
): Promise<ImportedTrack[]> {
  const ids = tracks.filter((track) => trackNeedsCover(track, playlistCover)).map((track) => track.spotifyId);
  if (!ids.length) return tracks;
  return applyCoverMap(tracks, await loadTrackCoverMap(ids));
}
