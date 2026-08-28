import { t } from "@/lib/i18n/runtime";
import { parseSpotifyEmbedHtml } from "@/lib/spotify/embed-parse";
import { hydrateTrackCovers, playlistNeedsCovers } from "@/lib/spotify/track-covers";
import { relayCursorFromRequest } from "@/lib/cursor/proxy";
import { relayLanGet, relayLanRequest } from "@/lib/nas/lan-proxy";
import { fetchYoutubeMusicEntity } from "@/lib/youtube/innertube";
import { parseYoutubeMusicUrl } from "@/lib/youtube/parse-url";

const EMBED_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const KINDS = new Set(["playlist", "album", "track"]);

export async function GET(request: Request) {
  const cursor = await relayCursorFromRequest(request);
  if (cursor) return cursor;
  const proxied = await relayLanGet(request);
  if (proxied) return proxied;

  const url = new URL(request.url);
  const youtubeUrl = url.searchParams.get("yt") ?? "";
  if (youtubeUrl) {
    const parsed = parseYoutubeMusicUrl(youtubeUrl);
    if (!parsed) {
      return Response.json({ error: t("nasExtra.ytMusicInvalid") }, { status: 400 });
    }
    try {
      return Response.json(await fetchYoutubeMusicEntity(parsed));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("nasExtra.youtubeReadFail");
      return Response.json(
        {
          error: /failed to fetch|network/i.test(message)
            ? t("nasExtra.ytMusicPcFail")
            : message,
        },
        { status: 502 },
      );
    }
  }

  const id = url.searchParams.get("id") ?? "";
  const type = (url.searchParams.get("type") ?? "playlist").toLowerCase();
  if (!KINDS.has(type)) {
    return Response.json({ error: t("nasExtra.badType") }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9]{22}$/.test(id)) {
    return Response.json({ error: t("nasExtra.spotifyLinkInvalid") }, { status: 400 });
  }

  const response = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": EMBED_UA,
    },
  });
  if (!response.ok) {
    return Response.json(
      { error: t("nasExtra.spotifyPublicFail") },
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
      { error: err instanceof Error ? err.message : t("nasExtra.publicListFail") },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const cursor = await relayCursorFromRequest(request);
  if (cursor) return cursor;
  try {
    const payload = (await request.json()) as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    const method = (payload.method ?? "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS", "PROPFIND", "PUT", "DELETE", "MKCOL"].includes(method)) {
      return Response.json({ error: t("nasExtra.methodNotAllowed") }, { status: 405 });
    }
    return await relayLanRequest(payload.url ?? "", method, payload.headers ?? {}, payload.body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : t("nasExtra.nasProxyInvalid") },
      { status: 400 },
    );
  }
}

