import { parseSpotifyEmbedHtml } from "@/lib/spotify/embed-parse";
import { hydrateTrackCovers, playlistNeedsCovers } from "@/lib/spotify/track-covers";
import { relayLanGet, relayLanRequest } from "@/lib/nas/lan-proxy";

const EMBED_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const KINDS = new Set(["playlist", "album", "track"]);

export async function GET(request: Request) {
  const proxied = await relayLanGet(request);
  if (proxied) return proxied;

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const type = (url.searchParams.get("type") ?? "playlist").toLowerCase();
  if (!KINDS.has(type)) {
    return Response.json({ error: "Tipo no válido." }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9]{22}$/.test(id)) {
    return Response.json({ error: "Ese enlace de Spotify no es válido." }, { status: 400 });
  }

  const response = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": EMBED_UA,
    },
  });
  if (!response.ok) {
    return Response.json(
      { error: "Spotify no devolvió el listado público." },
      { status: response.status === 404 ? 404 : 502 },
    );
  }

  try {
    const playlist = parseSpotifyEmbedHtml(
      await response.text(),
      type as "playlist" | "album" | "track",
      id,
    );
    if (!playlistNeedsCovers(playlist)) return Response.json(playlist);
    return Response.json({
      ...playlist,
      tracks: await hydrateTrackCovers(playlist.tracks, playlist.coverUrl),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el listado público." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    const method = (payload.method ?? "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS", "PROPFIND", "PUT", "DELETE"].includes(method)) {
      return Response.json({ error: "Método no permitido." }, { status: 405 });
    }
    return await relayLanRequest(payload.url ?? "", method, payload.headers ?? {}, payload.body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Proxy del NAS no válido." },
      { status: 400 },
    );
  }
}

