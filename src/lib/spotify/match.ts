import type { MusicSource, Track } from "@/lib/nas/types";
import { isPodcastTrack } from "@/lib/nas/webdav";
import { rememberTrackArtwork } from "@/lib/library/artwork-cache";
import { persistTrackCovers } from "@/lib/library/persist-covers";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\((remix|rmx)\)/gi, " $1 ")
    .replace(/\(.*?\)/g, " ")
    .replace(/（.*?）/g, " ")
    .replace(/[｜|]/g, " ")
    .replace(
      /\b(feat|ft|official|video|audio|lyrics?|letra|legal|prod|visualizer|topic)\b\.?/gi,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function trackBlob(track: Track): string {
  return `${track.title} ${track.artistName} ${track.albumName} ${track.id}`;
}

type PreparedTrack = {
  raw: Track;
  normTitle: string;
  normArtist: string;
  normArtistFirst: string;
  titleWords: string[];
  titleSet: Set<string>;
  paddedTitle: string;
  blob: string;
  durationMs: number;
};

class TrackIndex {
  exactTitleMap = new Map<string, PreparedTrack[]>();
  tokenMap = new Map<string, PreparedTrack[]>();
  all: PreparedTrack[] = [];

  constructor(pool: Track[]) {
    for (const raw of pool) {
      const normTitle = normalize(raw.title);
      const normArtist = normalize(raw.artistName);
      const artistParts = normArtist.split(/\s+/).filter((p) => p.length > 1);
      const normArtistFirst = artistParts[0] ?? "";
      const titleWords = normTitle.split(/\s+/).filter(Boolean);
      const titleSet = new Set(titleWords);
      const paddedTitle = ` ${normTitle} `;
      const blob = normalize(trackBlob(raw));
      const durationMs = raw.durationMs || 0;

      const prep: PreparedTrack = {
        raw,
        normTitle,
        normArtist,
        normArtistFirst,
        titleWords,
        titleSet,
        paddedTitle,
        blob,
        durationMs,
      };
      this.all.push(prep);

      if (normTitle) {
        let list = this.exactTitleMap.get(normTitle);
        if (!list) {
          list = [];
          this.exactTitleMap.set(normTitle, list);
        }
        list.push(prep);
      }

      for (const word of titleWords) {
        if (word.length >= 3) {
          let list = this.tokenMap.get(word);
          if (!list) {
            list = [];
            this.tokenMap.set(word, list);
          }
          list.push(prep);
        }
      }
    }
  }

  candidatesFor(importedNormTitle: string, importedTitleWords: string[]): PreparedTrack[] {
    const candidateSet = new Set<PreparedTrack>();
    const exact = this.exactTitleMap.get(importedNormTitle);
    if (exact) {
      for (const item of exact) candidateSet.add(item);
    }
    for (const word of importedTitleWords) {
      if (word.length >= 3) {
        const hits = this.tokenMap.get(word);
        if (hits) {
          for (const item of hits) candidateSet.add(item);
        }
      }
    }
    if (candidateSet.size > 0) {
      return Array.from(candidateSet);
    }
    return this.all;
  }
}

type PreparedImported = {
  raw: ImportedTrack;
  normTitle: string;
  normArtist: string;
  normArtistFirst: string;
  titleWords: string[];
  titleSet: Set<string>;
  paddedTitle: string;
  durationMs: number;
};

function prepareImported(track: ImportedTrack): PreparedImported {
  const normTitle = normalize(track.title);
  const normArtist = normalize(track.artistName);
  const artistParts = normArtist.split(/\s+/).filter((p) => p.length > 1);
  const titleWords = normTitle.split(/\s+/).filter(Boolean);
  return {
    raw: track,
    normTitle,
    normArtist,
    normArtistFirst: artistParts[0] ?? "",
    titleWords,
    titleSet: new Set(titleWords),
    paddedTitle: ` ${normTitle} `,
    durationMs: track.durationMs || 0,
  };
}

function titleCloseFast(imp: PreparedImported, cand: PreparedTrack): boolean {
  if (!imp.normTitle || !cand.normTitle) return false;
  if (imp.normTitle === cand.normTitle) return true;

  const left = imp.normTitle;
  const leftWords = imp.titleWords;
  const rightWords = cand.titleWords;
  const rightSet = cand.titleSet;
  const leftSet = imp.titleSet;

  if (left.length <= 4 || cand.normTitle.length <= 4 || leftWords.length === 1 || rightWords.length === 1) {
    return leftWords.some((w) => rightSet.has(w));
  }

  if (leftWords.every((w) => rightSet.has(w)) || rightWords.every((w) => leftSet.has(w))) {
    return true;
  }

  // Word boundary phrase matching without dynamic RegExp:
  if (cand.paddedTitle.includes(imp.paddedTitle)) return true;
  if (imp.paddedTitle.includes(cand.paddedTitle)) return true;

  return false;
}

function artistCloseFast(imp: PreparedImported, cand: PreparedTrack): boolean {
  if (!imp.normArtistFirst || !cand.normArtist) return false;
  return cand.normArtist.includes(imp.normArtistFirst);
}

function titleHitsFast(imp: PreparedImported, cand: PreparedTrack): boolean {
  return (
    titleCloseFast(imp, cand) ||
    cand.normArtist.includes(imp.normTitle) ||
    cand.blob.includes(imp.normTitle)
  );
}

function artistHitsFast(imp: PreparedImported, cand: PreparedTrack): boolean {
  return (
    artistCloseFast(imp, cand) ||
    cand.normTitle.includes(imp.normArtistFirst) ||
    cand.blob.includes(imp.normArtistFirst)
  );
}

function durationCloseFast(imp: PreparedImported, cand: PreparedTrack): boolean {
  if (imp.durationMs < 1000 || cand.durationMs < 1000) return false;
  return Math.abs(imp.durationMs - cand.durationMs) <= 4000;
}

function pickMatchFast(imp: PreparedImported, index: TrackIndex): Track | null {
  // 1. Fast O(1) exact title check
  const exactCandidates = index.exactTitleMap.get(imp.normTitle);
  if (exactCandidates && exactCandidates.length > 0) {
    const exactBoth = exactCandidates.find((c) => artistCloseFast(imp, c));
    if (exactBoth) return exactBoth.raw;
    const exactDur = exactCandidates.find((c) => durationCloseFast(imp, c));
    if (exactDur) return exactDur.raw;
    if (exactCandidates.length === 1) return exactCandidates[0]!.raw;
  }

  // 2. Focused candidates via token index
  const candidates = index.candidatesFor(imp.normTitle, imp.titleWords);

  const byBoth = candidates.find((c) => titleCloseFast(imp, c) && artistCloseFast(imp, c));
  if (byBoth) return byBoth.raw;

  const swapped = candidates.find((c) => titleHitsFast(imp, c) && artistHitsFast(imp, c));
  if (swapped) return swapped.raw;

  const byTitle = candidates.find((c) => titleCloseFast(imp, c));
  if (byTitle) return byTitle.raw;

  const byDuration = candidates.find((c) => titleHitsFast(imp, c) && durationCloseFast(imp, c));
  if (byDuration) return byDuration.raw;

  const byBlob = candidates.find((c) => c.blob.includes(imp.normTitle));
  if (byBlob) return byBlob.raw;

  return null;
}

async function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function matchImportedTracks(
  source: MusicSource,
  tracks: ImportedTrack[],
): Promise<ImportedTrack[]> {
  const library = await source.search("*");
  const pool = library.tracks.filter((track) => !isPodcastTrack(track));
  if (!pool.length) {
    return tracks.map((track) => ({ ...track, matched: null }));
  }

  const index = new TrackIndex(pool);
  const matched: ImportedTrack[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]!;
    if (track.matched) {
      matched.push(track);
      continue;
    }
    const imp = prepareImported(track);
    const local = pickMatchFast(imp, index);
    if (!local) {
      matched.push({ ...track, matched: null });
      continue;
    }
    const artworkUrl = track.coverUrl || local.artworkUrl || null;
    matched.push({
      ...track,
      matched: {
        ...local,
        artworkUrl,
        durationMs: local.durationMs || track.durationMs || 0,
      },
    });

    if (i % 50 === 0 && i > 0) {
      await yieldToEventLoop();
    }
  }

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

export async function fillUnmatchedImportedPlaylists(
  source: MusicSource,
  playlists: ImportedPlaylist[],
): Promise<{ playlists: ImportedPlaylist[]; changed: boolean }> {
  if (!playlists.some((playlist) => playlist.tracks.some((track) => !track.matched))) {
    return { playlists, changed: false };
  }
  const library = await source.search("*");
  const pool = library.tracks.filter((track) => !isPodcastTrack(track));
  if (!pool.length) return { playlists, changed: false };

  const index = new TrackIndex(pool);
  let changed = false;
  const artwork: { trackId: string; url?: string; coverId?: string | null; durationMs?: number }[] = [];
  const next: ImportedPlaylist[] = [];

  let count = 0;
  for (const playlist of playlists) {
    let listChanged = false;
    const tracks: ImportedTrack[] = [];

    for (const track of playlist.tracks) {
      count++;
      if (track.matched) {
        tracks.push(track);
        continue;
      }
      const imp = prepareImported(track);
      const local = pickMatchFast(imp, index);
      if (!local) {
        tracks.push(track);
        continue;
      }
      listChanged = true;
      changed = true;
      const artworkUrl = track.coverUrl || local.artworkUrl || null;
      artwork.push({
        trackId: local.id,
        url: track.coverUrl || undefined,
        coverId: local.coverId,
        durationMs: track.durationMs || local.durationMs || undefined,
      });
      tracks.push({
        ...track,
        matched: {
          ...local,
          artworkUrl,
          durationMs: local.durationMs || track.durationMs || 0,
        },
      });

      if (count % 50 === 0) {
        await yieldToEventLoop();
      }
    }
    next.push(listChanged ? { ...playlist, tracks } : playlist);
  }

  if (artwork.length) {
    void rememberTrackArtwork(artwork);
    persistTrackCovers(source, artwork);
  }
  return { playlists: next, changed };
}

export function matchedNasTracks(tracks: ImportedTrack[]): Track[] {
  const next: Track[] = [];
  for (const track of tracks) {
    if (!track.matched) continue;
    next.push({
      ...track.matched,
      artworkUrl: track.coverUrl || track.matched.artworkUrl || null,
      durationMs: track.matched.durationMs || track.durationMs || 0,
    });
  }
  return next;
}
