import { spotifyOpenUrl, type SpotifyEntityKind } from "@/lib/spotify/parse-url";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";

type EmbedImage = { url?: string; maxWidth?: number };
type EmbedArtist = { name?: string };

type EmbedTrack = {
  uri?: string;
  uid?: string;
  title?: string;
  subtitle?: string;
  duration?: number;
  coverArt?: { sources?: Array<{ url?: string }> };
  visualIdentity?: { image?: EmbedImage[] };
};

export type EmbedEntity = {
  name?: string;
  title?: string;
  subtitle?: string;
  type?: string;
  uri?: string;
  duration?: number;
  artists?: EmbedArtist[];
  coverArt?: { sources?: Array<{ url?: string }> };
  visualIdentity?: { image?: EmbedImage[] };
  trackList?: EmbedTrack[];
};

function trackId(raw: EmbedTrack, title: string, index: number): string {
  const fromUri = raw.uri?.match(/spotify:track:([a-zA-Z0-9]+)/i)?.[1];
  if (fromUri) return fromUri;
  if (raw.uid) return raw.uid;
  return `${title}-${index}`;
}

function coverFromEntity(entity: Pick<EmbedEntity, "coverArt" | "visualIdentity">): string | null {
  const fromArt = entity.coverArt?.sources?.find((source) => source.url)?.url;
  if (fromArt) return fromArt;
  const images = [...(entity.visualIdentity?.image ?? [])].sort(
    (a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0),
  );
  return images[0]?.url ?? null;
}

function trackCover(raw: EmbedTrack, fallback: string | null): string | null {
  return coverFromEntity(raw) ?? fallback;
}

function artistFromEntity(entity: EmbedEntity): string {
  const named = (entity.artists ?? []).map((artist) => artist.name?.trim()).filter(Boolean);
  if (named.length) return named.join(", ");
  return entity.subtitle?.trim() || "Artista";
}

function mapTrack(
  raw: EmbedTrack,
  index: number,
  coverUrl: string | null,
  albumName: string,
): ImportedTrack | null {
  const title = raw.title?.trim();
  if (!title) return null;
  return {
    spotifyId: trackId(raw, title, index),
    title,
    artistName: raw.subtitle?.trim() || "Artista",
    albumName,
    durationMs: typeof raw.duration === "number" ? raw.duration : 0,
    coverUrl,
    matched: null,
  };
}

function asSingleTrack(entity: EmbedEntity, coverUrl: string | null): ImportedTrack | null {
  const title = entity.title?.trim() || entity.name?.trim();
  if (!title) return null;
  const uri = entity.uri ?? "";
  const id = uri.match(/spotify:track:([a-zA-Z0-9]+)/i)?.[1] ?? title;
  return {
    spotifyId: id,
    title,
    artistName: artistFromEntity(entity),
    albumName: "",
    durationMs: typeof entity.duration === "number" ? entity.duration : 0,
    coverUrl,
    matched: null,
  };
}

function nextDataJson(html: string): unknown | null {
  const marker = html.search(/id=["']__NEXT_DATA__["']/i);
  if (marker < 0) return null;
  const jsonStart = html.indexOf(">", marker) + 1;
  const jsonEnd = html.indexOf("</script>", jsonStart);
  if (jsonStart <= 0 || jsonEnd < 0) return null;
  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch {
    return null;
  }
}

function findEntity(value: unknown, depth = 0): EmbedEntity | null {
  if (!value || typeof value !== "object" || depth > 12) return null;
  const rec = value as Record<string, unknown>;
  const type = typeof rec.type === "string" ? rec.type : "";
  const hasTracks = Array.isArray(rec.trackList);
  if (
    hasTracks ||
    type === "playlist" ||
    type === "album" ||
    type === "track" ||
    type === "episode"
  ) {
    if (rec.name || rec.title || hasTracks) return rec as EmbedEntity;
  }
  for (const child of Object.values(rec)) {
    const found = findEntity(child, depth + 1);
    if (found) return found;
  }
  return null;
}

export function isSpotifyEmbedHtml(html: string): boolean {
  return /id=["']__NEXT_DATA__["']/i.test(html) && /spotify/i.test(html);
}

function durationToMs(raw: string): number {
  const match = raw.match(/^(\d+):(\d{2})$/);
  if (!match) return 0;
  return (Number(match[1]) * 60 + Number(match[2])) * 1000;
}

export function parseSpotifyEmbedMarkdown(
  markdown: string,
  kind: SpotifyEntityKind,
  entityId: string,
): Omit<ImportedPlaylist, "importedAt"> {
  const titleLine = markdown.match(/^Title:\s*(.+)$/m)?.[1]?.replace(/\s*\|\s*Spotify\s*$/i, "").trim() ?? "";
  let name = titleLine;
  let ownerName = "Spotify";
  const dash = titleLine.lastIndexOf(" - ");
  if (dash > 0) {
    name = titleLine.slice(0, dash).trim() || name;
    ownerName = titleLine.slice(dash + 3).trim() || ownerName;
  }
  const heading = markdown.match(/^##\s+\[([^\]]+)\]/m)?.[1]?.trim();
  if (heading) name = heading;

  const coverUrl = markdown.match(/!\[[^\]]*\]\((https:\/\/image-cdn[^)\s]+)\)/)?.[1] ?? null;
  const albumName = kind === "album" ? name : "";
  const tracks: ImportedTrack[] = [];
  const lines = markdown.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const headingMatch = lines[i].match(/^\d+\.\s+###\s+(.+?)\s*$/);
    if (!headingMatch) continue;
    const title = headingMatch[1].trim();
    let artistName = "Artista";
    let durationMs = 0;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j += 1) {
      const artistMatch = lines[j].match(/^####\s+(?:E\s+)?(.+?)\s*$/);
      if (artistMatch) {
        artistName = artistMatch[1].replace(/,(?=\S)/g, ", ").trim();
        continue;
      }
      const durationMatch = lines[j].match(/^(\d+:\d{2})\s*$/);
      if (durationMatch) {
        durationMs = durationToMs(durationMatch[1]);
        break;
      }
    }
    const nearby = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
    const fromLink = nearby.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/i)?.[1];
    tracks.push({
      spotifyId: fromLink ?? `${entityId}-${tracks.length}`,
      title,
      artistName,
      albumName,
      durationMs,
      coverUrl: kind === "album" ? coverUrl : null,
      matched: null,
    });
  }

  if (!tracks.length) {
    throw new Error("No vinieron canciones. Si la playlist es privada, cámbiala a pública e inténtalo otra vez.");
  }

  return {
    id: entityId,
    kind,
    name: name || "Spotify",
    ownerName,
    coverUrl,
    spotifyUrl: spotifyOpenUrl(kind, entityId),
    tracks,
  };
}

export function parseSpotifyPublicPayload(
  payload: string,
  kind: SpotifyEntityKind,
  entityId: string,
): Omit<ImportedPlaylist, "importedAt"> {
  if (isSpotifyEmbedHtml(payload)) {
    return parseSpotifyEmbedHtml(payload, kind, entityId);
  }
  return parseSpotifyEmbedMarkdown(payload, kind, entityId);
}

export function parseSpotifyEmbedHtml(
  html: string,
  kind: SpotifyEntityKind,
  entityId: string,
): Omit<ImportedPlaylist, "importedAt"> {
  if (!isSpotifyEmbedHtml(html)) {
    throw new Error("No se pudo leer el embed público de Spotify.");
  }

  const payload = nextDataJson(html);
  const entity = findEntity(payload);
  if (!entity) {
    throw new Error("Ese enlace no trae datos públicos. Si es una playlist, ponla en público y espera un minuto.");
  }

  const coverUrl = coverFromEntity(entity);
  const albumName = kind === "album" ? entity.name?.trim() || entity.title?.trim() || "" : "";
  const trackFallback = kind === "album" || kind === "track" ? coverUrl : null;
  const listed = (entity.trackList ?? [])
    .map((track, index) => mapTrack(track, index, trackCover(track, trackFallback), albumName))
    .filter((track): track is ImportedTrack => Boolean(track));
  const tracks = listed.length
    ? listed
    : [asSingleTrack(entity, coverUrl)].filter((track): track is ImportedTrack => Boolean(track));

  if (!tracks.length) {
    throw new Error("No vinieron canciones. Si la playlist es privada, cámbiala a pública e inténtalo otra vez.");
  }

  return {
    id: entityId,
    kind,
    name: entity.name?.trim() || entity.title?.trim() || "Spotify",
    ownerName: artistFromEntity(entity),
    coverUrl,
    spotifyUrl: spotifyOpenUrl(kind, entityId),
    tracks,
  };
}
