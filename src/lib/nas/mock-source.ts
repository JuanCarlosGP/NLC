import { t } from "@/lib/i18n/runtime";
import type {
  Album,
  AlbumDetail,
  Artist,
  MusicSource,
  PingResult,
  PlayableSource,
  SearchResults,
  Track,
} from "@/lib/nas/types";

const STREAMS = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
];

function track(partial: Omit<Track, "durationMs" | "contentType"> & { streamIndex: number }): Track {
  const { streamIndex, ...rest } = partial;
  return {
    ...rest,
    durationMs: 0,
    contentType: "audio/mpeg",
    coverId: rest.albumId,
  };
}

const artists: Artist[] = [
  { id: "ar-atlas", name: "Atlas Chamber", albumCount: 2, coverId: "al-night-atlas" },
  { id: "ar-linen", name: "Linen Radio", albumCount: 1, coverId: "al-warm-static" },
];

const albums: Album[] = [
  {
    id: "al-night-atlas",
    name: "Night Atlas",
    artistId: "ar-atlas",
    artistName: "Atlas Chamber",
    year: 2021,
    coverId: "al-night-atlas",
    trackCount: 3,
  },
  {
    id: "al-second-room",
    name: "Second Room",
    artistId: "ar-atlas",
    artistName: "Atlas Chamber",
    year: 2023,
    coverId: "al-second-room",
    trackCount: 2,
  },
  {
    id: "al-warm-static",
    name: "Warm Static",
    artistId: "ar-linen",
    artistName: "Linen Radio",
    year: 2024,
    coverId: "al-warm-static",
    trackCount: 3,
  },
];

const tracks: Track[] = [
  track({
    id: "tr-meridian",
    title: "Meridian",
    albumId: "al-night-atlas",
    albumName: "Night Atlas",
    artistId: "ar-atlas",
    artistName: "Atlas Chamber",
    track: 1,
    streamIndex: 0,
  }),
  track({
    id: "tr-low-ceiling",
    title: "Low Ceiling",
    albumId: "al-night-atlas",
    albumName: "Night Atlas",
    artistId: "ar-atlas",
    artistName: "Atlas Chamber",
    track: 2,
    streamIndex: 1,
  }),
  track({
    id: "tr-glass-index",
    title: "Glass Index",
    albumId: "al-night-atlas",
    albumName: "Night Atlas",
    artistId: "ar-atlas",
    artistName: "Atlas Chamber",
    track: 3,
    streamIndex: 2,
  }),
  track({
    id: "tr-after-hours",
    title: "After Hours",
    albumId: "al-second-room",
    albumName: "Second Room",
    artistId: "ar-atlas",
    artistName: "Atlas Chamber",
    track: 1,
    streamIndex: 3,
  }),
  track({
    id: "tr-spare-chair",
    title: "Spare Chair",
    albumId: "al-second-room",
    albumName: "Second Room",
    artistId: "ar-atlas",
    artistName: "Atlas Chamber",
    track: 2,
    streamIndex: 4,
  }),
  track({
    id: "tr-paper-hum",
    title: "Paper Hum",
    albumId: "al-warm-static",
    albumName: "Warm Static",
    artistId: "ar-linen",
    artistName: "Linen Radio",
    track: 1,
    streamIndex: 5,
  }),
  track({
    id: "tr-copper-wire",
    title: "Copper Wire",
    albumId: "al-warm-static",
    albumName: "Warm Static",
    artistId: "ar-linen",
    artistName: "Linen Radio",
    track: 2,
    streamIndex: 6,
  }),
  track({
    id: "tr-late-signal",
    title: "Late Signal",
    albumId: "al-warm-static",
    albumName: "Warm Static",
    artistId: "ar-linen",
    artistName: "Linen Radio",
    track: 3,
    streamIndex: 7,
  }),
];

const streamByTrackId = new Map<string, string>(
  tracks.map((item, index) => [item.id, STREAMS[index] ?? STREAMS[0]]),
);

const MOCK_TRACK_IDS = new Set(tracks.map((item) => item.id));

export function isMockTrack(track: { id: string }): boolean {
  return MOCK_TRACK_IDS.has(track.id);
}

function matches(haystack: string, q: string): boolean {
  return haystack.toLowerCase().includes(q.trim().toLowerCase());
}

export const mockSource: MusicSource = {
  kind: "mock",

  async ping(): Promise<PingResult> {
    return {
      ok: true,
      message: t("nasExtra.mockLibrary"),
      serverName: "NLC mock",
      version: "0.1.0",
    };
  },

  async getArtists(): Promise<Artist[]> {
    return artists;
  },

  async getAlbums(): Promise<Album[]> {
    return albums;
  },

  async getAlbum(id: string): Promise<AlbumDetail> {
    const album = albums.find((item) => item.id === id);
    if (!album) throw new Error(t("nasExtra.mockAlbum"));
    return { ...album, tracks: tracks.filter((item) => item.albumId === id) };
  },

  async getTracks(albumId: string): Promise<Track[]> {
    const album = await this.getAlbum(albumId);
    return album.tracks;
  },

  async search(q: string): Promise<SearchResults> {
    if (!q.trim()) return { artists: [], albums: [], tracks: [] };
    return {
      artists: artists.filter((item) => matches(item.name, q)),
      albums: albums.filter(
        (item) => matches(item.name, q) || matches(item.artistName, q),
      ),
      tracks: tracks.filter(
        (item) =>
          matches(item.title, q) || matches(item.artistName, q) || matches(item.albumName, q),
      ),
    };
  },

  async streamUrl(trackId: string): Promise<PlayableSource> {
    const url = streamByTrackId.get(trackId);
    if (!url) throw new Error(t("nasExtra.noStream"));
    return url;
  },

  async coverUrl(): Promise<string | null> {
    return null;
  },
};
