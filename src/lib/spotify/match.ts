import type { MusicSource, Track } from "@/lib/nas/types";
import { rememberTrackArtwork } from "@/lib/library/artwork-cache";
import { persistTrackCovers } from "@/lib/library/persist-covers";
import type { ImportedTrack } from "@/lib/spotify/types";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/（.*?）/g, " ")
    .replace(/[｜|]/g, " ")
    .replace(/\b(feat|ft|official|video|audio|lyrics?|letra|version|versión|legal)\b\.?/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleClose(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function artistClose(a: string, b: string): boolean {
  const leftParts = normalize(a)
    .split(/\s+/)
    .filter((part) => part.length > 1);
  const right = normalize(b);
  if (!leftParts.length || !right) return false;
  // First artist token is enough (Spotify often lists "A, B").
  return right.includes(leftParts[0]!);
}

function trackBlob(track: Track): string {
  return `${track.title} ${track.artistName} ${track.albumName} ${track.id}`;
}

function pickMatch(imported: ImportedTrack, candidates: Track[]): Track | null {
  const byBoth = candidates.find(
    (track) => titleClose(imported.title, track.title) && artistClose(imported.artistName, track.artistName),
  );
  if (byBoth) return byBoth;

  const byTitle = candidates.find((track) => titleClose(imported.title, track.title));
  if (byTitle) return byTitle;

  // YouTube / yt-dlp names often keep artist+title in one string.
  return (
    candidates.find(
      (track) =>
        titleClose(imported.title, trackBlob(track)) &&
        (artistClose(imported.artistName, trackBlob(track)) || artistClose(imported.artistName, track.artistName)),
    ) ??
    candidates.find((track) => titleClose(imported.title, trackBlob(track))) ??
    null
  );
}

export async function matchImportedTracks(
  source: MusicSource,
  tracks: ImportedTrack[],
): Promise<ImportedTrack[]> {
  // Match against the full library. Searching "title artist" as one substring
  // fails because neither field contains the combined query.
  const library = await source.search("*");
  const pool = library.tracks;
  if (!pool.length) {
    return tracks.map((track) => ({ ...track, matched: null }));
  }
  const matched = tracks.map((track) => {
    const local = pickMatch(track, pool);
    if (!local) return { ...track, matched: null };
    const artworkUrl = track.coverUrl || local.artworkUrl || null;
    return {
      ...track,
      matched: {
        ...local,
        artworkUrl,
        durationMs: local.durationMs || track.durationMs || 0,
      },
    };
  });
  const artwork = matched
    .filter((track) => track.matched?.id)
    .map((track) => ({
      trackId: track.matched!.id,
      url: track.coverUrl || undefined,
      coverId: track.matched!.coverId,
      durationMs: track.durationMs || track.matched!.durationMs || undefined,
    }));
  void rememberTrackArtwork(artwork);
  persistTrackCovers(source, artwork);
  return matched;
}

export function matchedNasTracks(tracks: ImportedTrack[]): Track[] {
  return tracks
    .map((track) => {
      if (!track.matched) return null;
      return {
        ...track.matched,
        artworkUrl: track.coverUrl || track.matched.artworkUrl || null,
        durationMs: track.matched.durationMs || track.durationMs || 0,
      };
    })
    .filter((track): track is Track => Boolean(track));
}
