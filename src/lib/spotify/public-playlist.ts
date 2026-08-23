import { Platform } from "react-native";
import { parseSpotifyPublicPayload } from "@/lib/spotify/embed-parse";
import { spotifyEmbedUrl, type SpotifyEntityKind } from "@/lib/spotify/parse-url";
import { hydrateTrackCovers, playlistNeedsCovers } from "@/lib/spotify/track-covers";
import type { ImportedPlaylist } from "@/lib/spotify/types";

async function withHydratedCovers(
  playlist: Omit<ImportedPlaylist, "importedAt">,
): Promise<Omit<ImportedPlaylist, "importedAt">> {
  if (!playlistNeedsCovers(playlist)) return playlist;
  return { ...playlist, tracks: await hydrateTrackCovers(playlist.tracks, playlist.coverUrl) };
}

const EMBED_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchViaLocalApi(
  kind: SpotifyEntityKind,
  entityId: string,
): Promise<Omit<ImportedPlaylist, "importedAt"> | null> {
  try {
    const response = await fetch(
      `/api/spotify-embed?id=${encodeURIComponent(entityId)}&type=${encodeURIComponent(kind)}`,
    );
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;
    const payload = (await response.json()) as Omit<ImportedPlaylist, "importedAt"> & { error?: string };
    if (!response.ok) return null;
    if (Array.isArray(payload.tracks) && payload.tracks.length) return payload;
    return null;
  } catch {
    return null;
  }
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<string | null> {
  try {
    const response = await fetch(url, headers ? { headers } : undefined);
    if (!response.ok) return null;
    const text = await response.text();
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

function sourceLoaders(kind: SpotifyEntityKind, entityId: string): Array<() => Promise<string | null>> {
  const embedUrl = spotifyEmbedUrl(kind, entityId);
  const jinaUrl = `https://r.jina.ai/${embedUrl}`;
  if (Platform.OS === "web") {
    return [
      () => fetchText(jinaUrl, { Accept: "text/plain,*/*" }),
      () => fetchText(jinaUrl, { "X-Respond-With": "html", Accept: "text/html,text/plain,*/*" }),
    ];
  }
  return [
    () => fetchText(embedUrl, { Accept: "text/html", "User-Agent": EMBED_UA }),
    () => fetchText(jinaUrl, { "X-Respond-With": "html", Accept: "text/html,text/plain,*/*" }),
  ];
}

export async function fetchPublicSpotifyEntity(
  kind: SpotifyEntityKind,
  entityId: string,
): Promise<Omit<ImportedPlaylist, "importedAt">> {
  if (Platform.OS === "web") {
    const fromApi = await fetchViaLocalApi(kind, entityId);
    if (fromApi) return withHydratedCovers(fromApi);
  }

  let lastError: Error | null = null;
  for (const load of sourceLoaders(kind, entityId)) {
    const payload = await load();
    if (!payload) continue;
    try {
      const parsed = parseSpotifyPublicPayload(payload, kind, entityId);
      return withHydratedCovers(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("No se pudo leer el listado público.");
    }
  }

  throw (
    lastError ??
    new Error("No se pudo leer el listado público de ese enlace. Si es una playlist, comprueba que sea pública.")
  );
}

export async function fetchPublicSpotifyPlaylist(
  playlistId: string,
): Promise<Omit<ImportedPlaylist, "importedAt">> {
  return fetchPublicSpotifyEntity("playlist", playlistId);
}
