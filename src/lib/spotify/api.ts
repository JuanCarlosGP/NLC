import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";

type SpotifyImage = { url?: string };
type SpotifyArtist = { name?: string };
type SpotifyAlbum = { name?: string; images?: SpotifyImage[] };
type SpotifyTrack = {
  id?: string;
  name?: string;
  duration_ms?: number;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
};
type PlaylistPage = {
  next?: string | null;
  items?: Array<{ track?: SpotifyTrack | null }>;
};
type PlaylistPayload = {
  id?: string;
  name?: string;
  external_urls?: { spotify?: string };
  images?: SpotifyImage[];
  owner?: { display_name?: string };
  tracks?: PlaylistPage;
};

function firstImage(images?: SpotifyImage[]): string | null {
  return images?.find((image) => image.url)?.url ?? null;
}

function mapTrack(raw: SpotifyTrack | null | undefined): ImportedTrack | null {
  if (!raw?.id || !raw.name) return null;
  return {
    spotifyId: raw.id,
    title: raw.name,
    artistName: (raw.artists ?? []).map((artist) => artist.name).filter(Boolean).join(", ") || "Artista",
    albumName: raw.album?.name ?? "",
    durationMs: typeof raw.duration_ms === "number" ? raw.duration_ms : 0,
    coverUrl: firstImage(raw.album?.images),
    matched: null,
  };
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) {
    throw new Error("Sesión de Spotify caducada. Conecta de nuevo en Ajustes.");
  }
  if (response.status === 403) {
    throw new Error("Spotify no dejó leer esta playlist. Tiene que ser tuya o colaborativa.");
  }
  if (response.status === 404) {
    throw new Error("No se encontró esa playlist.");
  }
  if (!response.ok) {
    throw new Error(`Spotify respondió ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function fetchSpotifyPlaylist(
  accessToken: string,
  playlistId: string,
): Promise<Omit<ImportedPlaylist, "importedAt" | "tracks"> & { tracks: ImportedTrack[] }> {
  const playlist = await getJson<PlaylistPayload>(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,external_urls,images,owner(display_name),tracks(next,items(track(id,name,duration_ms,artists(name),album(name,images))))`,
    accessToken,
  );

  const tracks: ImportedTrack[] = [];
  let page: PlaylistPage | undefined = playlist.tracks;
  while (page) {
    for (const item of page.items ?? []) {
      const mapped = mapTrack(item.track);
      if (mapped) tracks.push(mapped);
    }
    if (!page.next) break;
    page = await getJson<PlaylistPage>(page.next, accessToken);
  }

  return {
    id: playlist.id ?? playlistId,
    kind: "playlist",
    name: playlist.name ?? "Playlist",
    ownerName: playlist.owner?.display_name ?? "Spotify",
    coverUrl: firstImage(playlist.images) ?? tracks[0]?.coverUrl ?? null,
    spotifyUrl: playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlistId}`,
    tracks,
  };
}

export async function fetchSpotifyPlaylistPreview(playlistUrl: string): Promise<{
  title: string;
  thumbnail: string | null;
}> {
  const encoded = encodeURIComponent(playlistUrl);
  const endpoints = [
    `https://open.spotify.com/oembed?url=${encoded}`,
    `https://noembed.com/embed?url=${encoded}`,
  ];
  let lastMessage = "No se pudo leer esa playlist.";
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        lastMessage = "No se pudo leer esa playlist. ¿Es un enlace público?";
        continue;
      }
      const payload = (await response.json()) as { title?: string; thumbnail_url?: string };
      return {
        title: payload.title?.trim() || "Playlist",
        thumbnail: payload.thumbnail_url ?? null,
      };
    } catch {
      lastMessage =
        "No se pudo leer la playlist. En el navegador Spotify suele bloquearlo; pruébalo en el APK.";
    }
  }
  throw new Error(lastMessage);
}
export async function fetchSpotifyProfileName(accessToken: string): Promise<string> {
  const profile = await getJson<{ display_name?: string }>("https://api.spotify.com/v1/me", accessToken);
  return profile.display_name ?? "Spotify";
}
