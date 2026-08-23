export type Artist = {
  id: string;
  name: string;
  albumCount?: number;
  coverId?: string | null;
};

export type Album = {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  year?: number | null;
  coverId?: string | null;
  trackCount?: number;
};

export type Track = {
  id: string;
  title: string;
  albumId: string;
  albumName: string;
  artistId: string;
  artistName: string;
  durationMs: number;
  track?: number;
  disc?: number;
  contentType?: string;
  coverId?: string | null;
  /** Remote artwork (e.g. Spotify) when the NAS file has no cover. */
  artworkUrl?: string | null;
};

export type AlbumDetail = Album & { tracks: Track[] };

export type SearchResults = {
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
};

export type PingResult = {
  ok: boolean;
  message: string;
  serverName?: string;
  version?: string;
};

export type MusicSourceKind = "mock" | "opensubsonic" | "webdav" | "local";

export type PlayableSource = string | { uri: string; headers?: Record<string, string> };

export interface MusicSource {
  readonly kind: MusicSourceKind;
  ping(): Promise<PingResult>;
  getArtists(): Promise<Artist[]>;
  getAlbums(): Promise<Album[]>;
  getAlbum(id: string): Promise<AlbumDetail>;
  getTracks(albumId: string): Promise<Track[]>;
  search(q: string): Promise<SearchResults>;
  streamUrl(trackId: string): Promise<PlayableSource>;
  coverUrl(id: string, size?: number): Promise<string | null>;
  /** Permanently remove a track file (WebDAV). Optional on other sources. */
  deleteTrack?(trackId: string): Promise<void>;
  /** Write a sidecar image next to a WebDAV audio file. Returns the NAS path or null. */
  ensureCoverSidecar?(trackId: string, imageUrl: string): Promise<string | null>;
}
