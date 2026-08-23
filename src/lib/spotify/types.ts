import type { Track } from "@/lib/nas/types";
import type { SpotifyEntityKind } from "@/lib/spotify/parse-url";

export type PlaylistKind = SpotifyEntityKind | "local";

export type ImportedTrack = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  durationMs: number;
  coverUrl: string | null;
  matched: Track | null;
};

export type ImportedPlaylist = {
  id: string;
  kind: PlaylistKind;
  name: string;
  ownerName: string;
  coverUrl: string | null;
  spotifyUrl: string;
  importedAt: number;
  liked?: boolean;
  tracks: ImportedTrack[];
};
