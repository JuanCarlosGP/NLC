import type { NasSettings } from "@/lib/settings/storage";
import { nasBaseUrl } from "@/lib/settings/storage";
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

type SubsonicError = { code?: number; message?: string };
type SubsonicEnvelope = {
  "subsonic-response"?: {
    status?: string;
    version?: string;
    type?: string;
    error?: SubsonicError;
    artists?: { index?: Array<{ artist?: unknown }> };
    albumList2?: { album?: unknown };
    album?: unknown;
    searchResult3?: {
      artist?: unknown;
      album?: unknown;
      song?: unknown;
    };
  };
};

function asArray<T>(value: unknown): T[] {
  if (!value) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
}

function encodePassword(password: string): string {
  const bytes = new TextEncoder().encode(password);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `enc:${hex}`;
}

function mapArtist(raw: Record<string, unknown>): Artist {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "Artista"),
    albumCount: typeof raw.albumCount === "number" ? raw.albumCount : undefined,
    coverId: raw.coverArt ? String(raw.coverArt) : raw.id ? String(raw.id) : null,
  };
}

function mapAlbum(raw: Record<string, unknown>): Album {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? raw.album ?? "Álbum"),
    artistId: String(raw.artistId ?? ""),
    artistName: String(raw.artist ?? "Artista"),
    year: typeof raw.year === "number" ? raw.year : null,
    coverId: raw.coverArt ? String(raw.coverArt) : raw.id ? String(raw.id) : null,
    trackCount: typeof raw.songCount === "number" ? raw.songCount : undefined,
  };
}

function mapTrack(raw: Record<string, unknown>): Track {
  const durationSec = typeof raw.duration === "number" ? raw.duration : 0;
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? "Pista"),
    albumId: String(raw.albumId ?? ""),
    albumName: String(raw.album ?? ""),
    artistId: String(raw.artistId ?? ""),
    artistName: String(raw.artist ?? ""),
    durationMs: durationSec * 1000,
    track: typeof raw.track === "number" ? raw.track : undefined,
    disc: typeof raw.discNumber === "number" ? raw.discNumber : undefined,
    contentType: raw.contentType ? String(raw.contentType) : undefined,
    coverId: raw.coverArt ? String(raw.coverArt) : raw.albumId ? String(raw.albumId) : null,
  };
}

export function createOpenSubsonicSource(
  settings: NasSettings,
  password: string,
): MusicSource {
  const client = "nlc";
  const apiVersion = "1.16.1";

  function authQuery(): string {
    const params = new URLSearchParams({
      u: settings.username.trim(),
      p: encodePassword(password),
      v: apiVersion,
      c: client,
      f: "json",
    });
    return params.toString();
  }

  function restUrl(endpoint: string, extra?: Record<string, string>): string {
    const url = new URL(`${nasBaseUrl(settings)}/rest/${endpoint}`);
    url.search = authQuery();
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  async function request(endpoint: string, extra?: Record<string, string>): Promise<NonNullable<SubsonicEnvelope["subsonic-response"]>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(restUrl(endpoint, extra), { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = (await response.json()) as SubsonicEnvelope;
      const body = json["subsonic-response"];
      if (!body) throw new Error("Respuesta OpenSubsonic vacía.");
      if (body.status === "failed") {
        throw new Error(body.error?.message ?? "Error del servidor de música.");
      }
      return body;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Sin respuesta del NAS. ¿Está Navidrome en marcha?");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    kind: "opensubsonic",

    async ping(): Promise<PingResult> {
      try {
        if (!settings.host.trim()) {
          return { ok: false, message: "Falta la IP del servidor." };
        }
        if (!settings.username.trim() && !password) {
          return { ok: false, message: "Faltan el usuario y la contraseña." };
        }
        if (!settings.username.trim()) return { ok: false, message: "Falta el usuario." };
        if (!password) return { ok: false, message: "Falta la contraseña." };
        const body = await request("ping.view");
        const name = body.type ? String(body.type) : "Navidrome";
        return {
          ok: true,
          message: `Hay conexión con ${name}.`,
          serverName: name,
          version: body.version,
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "No se pudo conectar.",
        };
      }
    },

    async getArtists(): Promise<Artist[]> {
      const body = await request("getArtists.view");
      const indexes = asArray<{ artist?: unknown }>(body.artists?.index);
      return indexes.flatMap((index) => asArray<Record<string, unknown>>(index.artist).map(mapArtist));
    },

    async getAlbums(): Promise<Album[]> {
      const body = await request("getAlbumList2.view", { type: "alphabeticalByName", size: "500" });
      return asArray<Record<string, unknown>>(body.albumList2?.album).map(mapAlbum);
    },

    async getAlbum(id: string): Promise<AlbumDetail> {
      const body = await request("getAlbum.view", { id });
      const raw = (body.album ?? {}) as Record<string, unknown>;
      const album = mapAlbum(raw);
      const songs = asArray<Record<string, unknown>>(raw.song).map(mapTrack);
      return { ...album, tracks: songs };
    },

    async getTracks(albumId: string): Promise<Track[]> {
      const album = await this.getAlbum(albumId);
      return album.tracks;
    },

    async search(q: string): Promise<SearchResults> {
      if (!q.trim()) return { artists: [], albums: [], tracks: [] };
      const body = await request("search3.view", { query: q.trim(), artistCount: "20", albumCount: "20", songCount: "40" });
      const result = body.searchResult3 ?? {};
      return {
        artists: asArray<Record<string, unknown>>(result.artist).map(mapArtist),
        albums: asArray<Record<string, unknown>>(result.album).map(mapAlbum),
        tracks: asArray<Record<string, unknown>>(result.song).map(mapTrack),
      };
    },

    async streamUrl(trackId: string): Promise<PlayableSource> {
      const extra: Record<string, string> = { id: trackId };
      if (settings.maxBitRate && settings.maxBitRate !== "0") {
        extra.maxBitRate = settings.maxBitRate;
        extra.format = "mp3";
      }
      return restUrl("stream.view", extra);
    },

    async coverUrl(id: string, size = 300): Promise<string | null> {
      if (!id) return null;
      return restUrl("getCoverArt.view", { id, size: String(size) });
    },
  };
}
