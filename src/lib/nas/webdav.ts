import type { Album, AlbumDetail, Artist, Track } from "@/lib/nas/types";

export type WebDavEntry = {
  path: string;
  name: string;
  dir: boolean;
  size?: number;
};

export type WebDavIndex = {
  artists: Artist[];
  albums: Album[];
  albumTracks: Record<string, Track[]>;
  tracks: Track[];
  scannedAt: number;
};

const AUDIO_EXT = new Set(["mp3", "m4a", "m4b", "flac", "ogg", "opus", "wav", "aac", "wma", "aiff", "aif"]);
const COVER_NAMES = new Set([
  "cover.jpg",
  "cover.jpeg",
  "cover.png",
  "folder.jpg",
  "folder.jpeg",
  "folder.png",
  "front.jpg",
  "album.jpg",
  "artwork.jpg",
]);
const SKIP_DIRS = new Set(["@eadir", "#recycle", "#snapshot", ".trash", "lost+found", ".ds_store"]);
const SKIP_FILES = new Set(["snd.json"]);

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;

export function normalizeSharePath(path: string): string {
  let trimmed = path.trim() || "/Music";
  trimmed = trimmed.replace(/^\/volume\d+\//i, "/");
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

export function joinPath(base: string, child: string): string {
  if (child.startsWith("http://") || child.startsWith("https://")) {
    try {
      return decodeURI(new URL(child).pathname);
    } catch {
      return child;
    }
  }
  if (child.startsWith("/")) return child.replace(/\/+$/, "") || "/";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  const clean = child.replace(/\/+$/, "");
  return `${prefix}/${clean}`.replace(/\/{2,}/g, "/");
}

export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isAudioFile(name: string): boolean {
  return AUDIO_EXT.has(extOf(name));
}

export function isCoverFile(name: string): boolean {
  return COVER_NAMES.has(name.toLowerCase());
}

export function parseHtmlIndex(html: string, basePath: string): WebDavEntry[] {
  const entries: WebDavEntry[] = [];
  const seen = new Set<string>();
  const re = /<a\s+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[1] ?? "";
    const label = (match[2] ?? "").trim();
    if (!href || href.startsWith("?") || href.startsWith("#") || href.startsWith("mailto:")) continue;
    const lower = href.toLowerCase();
    if (lower === "/" || lower === "../" || lower.includes("parent directory")) continue;
    if (label.toLowerCase() === "parent directory") continue;
    const dir = href.endsWith("/");
    const path = joinPath(basePath, decodeURIComponent(href));
    const name = (dir ? path.split("/").filter(Boolean).at(-1) : path.split("/").filter(Boolean).at(-1)) ?? label;
    if (!name || SKIP_DIRS.has(name.toLowerCase()) || SKIP_FILES.has(name.toLowerCase()) || name.startsWith(".")) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, name, dir });
  }
  return entries;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parsePropfind(xml: string): WebDavEntry[] {
  const chunks = xml.split(/<(?:[\w-]+:)?response[\s>]/i).slice(1);
  const entries: WebDavEntry[] = [];
  for (const chunk of chunks) {
    const hrefMatch = chunk.match(/<(?:[\w-]+:)?href>([^<]+)<\/(?:[\w-]+:)?href>/i);
    if (!hrefMatch) continue;
    let path = decodeXml(hrefMatch[1] ?? "");
    try {
      if (path.startsWith("http")) path = new URL(path).pathname;
    } catch {
      // keep path
    }
    path = decodeURIComponent(path);
    const dir = /<(?:[\w-]+:)?collection\b/i.test(chunk) || path.endsWith("/");
    path = path.replace(/\/+$/, "") || "/";
    const name = path.split("/").filter(Boolean).at(-1) ?? "";
    if (!name || SKIP_DIRS.has(name.toLowerCase()) || SKIP_FILES.has(name.toLowerCase()) || name.startsWith(".")) continue;
    const sizeMatch = chunk.match(/<(?:[\w-]+:)?getcontentlength>(\d+)<\/(?:[\w-]+:)?getcontentlength>/i);
    entries.push({
      path,
      name,
      dir,
      size: sizeMatch ? Number(sizeMatch[1]) : undefined,
    });
  }
  return entries;
}

export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${utf8ToBase64(`${username}:${password}`)}`;
}

function utf8ToBase64(value: string): string {
  if (typeof globalThis.btoa === "function") {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return globalThis.btoa(binary);
  }
  const BufferCtor = (globalThis as { Buffer?: { from: (input: string, enc: string) => { toString: (enc: string) => string } } })
    .Buffer;
  if (BufferCtor) return BufferCtor.from(value, "utf8").toString("base64");
  throw new Error("No hay codificador Base64.");
}

export function cleanDisplayTitle(value: string): string {
  let next = value
    // yt-dlp video id suffix
    .replace(/\s*\[[a-zA-Z0-9_-]{11}\]\s*$/u, "")
    // Anything in (), [], {}, fullwidth brackets
    .replace(/[([{（【][^)\]}）】]*[)\]}）】]/gu, " ")
    // Trailing junk: "_ Letra", "- Official Video", "| Lyrics"
    .replace(
      /(?:\s*[_\-|｜:/]+|\s+)\b(letra|lyrics?|oficial|official|video(?:clip)?|audio|visualizer|hd|4k|mv|topic|version|versión|legal)\b.*$/iu,
      "",
    )
    .replace(/[_｜|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return next || value.trim();
}

export function parseTrackName(filename: string): { title: string; track?: number } {
  let base = filename.replace(/\.[^.]+$/, "").trim();
  base = cleanDisplayTitle(base);
  const numbered = base.match(/^(\d{1,3})\s*[.\-_]\s*(.+)$/);
  if (numbered) {
    return { track: Number(numbered[1]), title: cleanDisplayTitle(numbered[2] ?? base) };
  }
  return { title: base };
}

/** "Artist - Title" filenames from yt-dlp song downloads. */
export function splitArtistTitle(name: string): { artist: string; title: string } {
  const match = name.match(/^(.+?)\s+[-–—]\s+(.+)$/u);
  if (match?.[1] && match[2]) {
    return {
      artist: cleanDisplayTitle(match[1]),
      title: cleanDisplayTitle(match[2]),
    };
  }
  return { artist: "Desconocido", title: cleanDisplayTitle(name) };
}

function parseYear(albumName: string): number | null {
  const match = albumName.match(/\((19|20)\d{2}\)|\[(19|20)\d{2}\]/);
  if (!match) return null;
  const year = Number((match[0] ?? "").replace(/\D/g, ""));
  return year || null;
}

/** Top-level Music/Podcasts/… — not a music artist. */
export function isPodcastFolderName(name: string): boolean {
  return name.trim().toLowerCase() === "podcasts";
}

export function isPodcastAlbum(album: Pick<Album, "id" | "name" | "artistName">): boolean {
  return (
    isPodcastFolderName(album.artistName) ||
    isPodcastFolderName(album.name) ||
    /(?:^|\/)podcasts(?:\/|$)/i.test(album.id)
  );
}

export function isPodcastArtist(artist: Pick<Artist, "id" | "name">): boolean {
  return isPodcastFolderName(artist.name) || /^artist:podcasts$/i.test(artist.id);
}

export function isPodcastTrack(track: Pick<Track, "albumId" | "albumName" | "artistName">): boolean {
  return isPodcastAlbum({ id: track.albumId, name: track.albumName, artistName: track.artistName });
}

/** Top-level Music/Canciones/… — yt-dlp songs bucket. */
export function isSongsFolderName(name: string): boolean {
  return name.trim().toLowerCase() === "canciones";
}

export function isSongsAlbum(album: Pick<Album, "id" | "name" | "artistName">): boolean {
  const name = album.name.trim().toLowerCase();
  return (
    isSongsFolderName(album.artistName) ||
    isSongsFolderName(album.name) ||
    name === "singles" ||
    /(?:^|\/)canciones(?:\/|$)/i.test(album.id) ||
    /\/singles$/i.test(album.id)
  );
}

export function isSongsArtist(artist: Pick<Artist, "id" | "name">): boolean {
  return isSongsFolderName(artist.name) || /^artist:canciones$/i.test(artist.id);
}

export function buildIndex(rootPath: string, files: WebDavEntry[], covers: Map<string, string>): WebDavIndex {
  const albumMap = new Map<string, AlbumDetail>();
  const artistMap = new Map<string, Artist>();
  const tracks: Track[] = [];

  for (const file of files) {
    if (!isAudioFile(file.name)) continue;
    const relative = file.path.slice(rootPath.length).replace(/^\/+/, "");
    const parts = relative.split("/").filter(Boolean);
    if (!parts.length) continue;
    const filename = parts.at(-1) ?? file.name;
    const parentDir = file.path.replace(/\/[^/]+$/, "") || rootPath;
    const podcastTree = isPodcastFolderName(parts[0] ?? "");
    const songsTree = isSongsFolderName(parts[0] ?? "");
    const parsed = parseTrackName(filename);
    let title = parsed.title;
    const track = parsed.track;
    let artistName = "Desconocido";
    let albumName = "Sin álbum";

    if (podcastTree) {
      artistName = "Podcasts";
      albumName = parts.length >= 3 ? (parts[1] ?? "Podcasts") : "Podcasts";
    } else if (songsTree) {
      // Flat Music/Canciones — one bucket, real artist only on the track.
      const split = splitArtistTitle(title);
      artistName = split.artist;
      title = split.title;
      albumName = "Canciones";
    } else if (parts.length >= 3) {
      artistName = parts[0] ?? artistName;
      albumName = parts[1] ?? albumName;
    } else if (parts.length === 2) {
      artistName = parts[0] ?? artistName;
      albumName = parts[0] ?? albumName;
    }

    const artistId = `artist:${artistName}`;
    const albumId = songsTree ? "album:canciones" : `album:${artistName}/${albumName}`;
    const albumArtistId = songsTree ? "artist:canciones" : artistId;
    const albumArtistName = songsTree ? "Canciones" : artistName;
    const coverPath = covers.get(parentDir) ?? covers.get(`${parentDir}`) ?? null;

    // Don't invent artists/albums for the flat Canciones dump (same idea as podcasts).
    if (!podcastTree && !songsTree && !artistMap.has(artistId)) {
      artistMap.set(artistId, { id: artistId, name: artistName, albumCount: 0, coverId: coverPath });
    }
    let album = albumMap.get(albumId);
    if (!album) {
      album = {
        id: albumId,
        name: albumName,
        artistId: albumArtistId,
        artistName: albumArtistName,
        year: parseYear(albumName),
        coverId: coverPath,
        trackCount: 0,
        tracks: [],
      };
      albumMap.set(albumId, album);
      const artist = artistMap.get(albumArtistId);
      if (artist) artist.albumCount = (artist.albumCount ?? 0) + 1;
    }

    const item: Track = {
      id: file.path,
      title,
      albumId,
      albumName,
      artistId,
      artistName,
      durationMs: 0,
      track,
      contentType: mimeFor(filename),
      coverId: coverPath ?? album.coverId ?? null,
    };
    album.tracks.push(item);
    album.trackCount = album.tracks.length;
    if (!album.coverId && coverPath) album.coverId = coverPath;
    tracks.push(item);
  }

  for (const album of albumMap.values()) {
    album.tracks.sort((a, b) => (a.track ?? 999) - (b.track ?? 999) || a.title.localeCompare(b.title, "es"));
  }

  return {
    artists: [...artistMap.values()].sort((a, b) => a.name.localeCompare(b.name, "es")),
    albums: [...albumMap.values()]
      .map(({ tracks: _tracks, ...album }) => album)
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    albumTracks: Object.fromEntries([...albumMap.values()].map((album) => [album.id, album.tracks])),
    tracks,
    scannedAt: Date.now(),
  };
}

function mimeFor(name: string): string | undefined {
  const ext = extOf(name);
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "flac") return "audio/flac";
  if (ext === "m4a" || ext === "m4b" || ext === "aac") return "audio/mp4";
  if (ext === "ogg" || ext === "opus") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  return undefined;
}

export function emptyIndex(): WebDavIndex {
  return { artists: [], albums: [], albumTracks: {}, tracks: [], scannedAt: Date.now() };
}

export { PROPFIND_BODY, AUDIO_EXT };
