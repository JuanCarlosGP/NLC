import type { MusicSource, Track } from "@/lib/nas/types";
import type { ImportedTrack } from "@/lib/spotify/types";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/\bfeat\.?.*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleClose(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left) && (left === right || left.includes(right) || right.includes(left));
}

function artistClose(a: string, b: string): boolean {
  const left = normalize(a).split(" ")[0] ?? "";
  const right = normalize(b);
  return Boolean(left) && right.includes(left);
}

function pickMatch(imported: ImportedTrack, candidates: Track[]): Track | null {
  return (
    candidates.find(
      (track) => titleClose(imported.title, track.title) && artistClose(imported.artistName, track.artistName),
    ) ??
    candidates.find((track) => titleClose(imported.title, track.title)) ??
    null
  );
}

export async function matchImportedTracks(
  source: MusicSource,
  tracks: ImportedTrack[],
): Promise<ImportedTrack[]> {
  const matched: ImportedTrack[] = [];
  const chunkSize = 4;
  for (let i = 0; i < tracks.length; i += chunkSize) {
    const chunk = tracks.slice(i, i + chunkSize);
    const next = await Promise.all(
      chunk.map(async (track) => {
        try {
          const results = await source.search(`${track.title} ${track.artistName.split(",")[0] ?? ""}`.trim());
          return { ...track, matched: pickMatch(track, results.tracks) };
        } catch {
          return { ...track, matched: null };
        }
      }),
    );
    matched.push(...next);
  }
  return matched;
}

export function matchedNasTracks(tracks: ImportedTrack[]): Track[] {
  return tracks.map((track) => track.matched).filter((track): track is Track => Boolean(track));
}
