export type TrackArtworkQuery = {
  title: string;
  artistName?: string | null;
  albumName?: string | null;
  spotifyId?: string | null;
};

const GENERIC_ARTISTS = new Set([
  "unknown",
  "unknown artist",
  "desconocido",
  "artista desconocido",
  "various",
  "various artists",
  "varios",
  "varios artistas",
]);

function cleanTrackTitle(raw: string): string {
  if (!raw) return "";
  let title = raw.trim();

  // Strip leading track numbers: "01. ", "1 - ", etc.
  title = title.replace(/^\s*\d{1,3}[\s._-]+/, "");

  // Strip common audio extensions if filename was used as title
  title = title.replace(/\.(mp3|flac|m4a|wav|aac|ogg|opus|wma|aiff|alac)$/i, "");

  // Strip bracketed video/quality/remaster tags
  title = title.replace(
    /\[(?:official\s*(?:music\s*)?video|audio|lyrics?|hd|hq|4k|remaster(?:ed)?(?:\s*\d{4})?)\]/gi,
    "",
  );

  // Strip parenthesized video/audio/remaster tags
  title = title.replace(
    /\((?:official\s*(?:music\s*)?video|audio|lyrics?|hd|hq|4k|remaster(?:ed)?(?:\s*\d{4})?|video\s*oficial|audio\s*oficial|visualizer)\)/gi,
    "",
  );

  // Strip trailing " - Single", " - EP", etc.
  title = title.replace(/\s*-\s*(single|ep)$/i, "");

  return title.trim();
}

function cleanArtist(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (GENERIC_ARTISTS.has(trimmed.toLowerCase())) return "";
  return trimmed;
}

async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSpotifyOembed(spotifyId: string): Promise<string | null> {
  try {
    const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(
      `https://open.spotify.com/track/${spotifyId}`,
    )}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { thumbnail_url?: string };
    return json.thumbnail_url?.trim() || null;
  } catch {
    return null;
  }
}

async function fetchDeezerCover(query: string): Promise<string | null> {
  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=3`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{
        album?: {
          cover_xl?: string;
          cover_big?: string;
          cover_medium?: string;
        };
      }>;
    };
    if (!Array.isArray(json.data)) return null;
    for (const item of json.data) {
      const cover = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium;
      if (cover?.startsWith("http")) return cover;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchItunesCover(query: string): Promise<string | null> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=3`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{
        artworkUrl100?: string;
      }>;
    };
    if (!Array.isArray(json.results)) return null;
    for (const item of json.results) {
      if (item.artworkUrl100?.startsWith("http")) {
        // Upgrade to 600x600 high resolution
        return item.artworkUrl100.replace(/\/100x100bb\.(jpg|png|webp)$/i, "/600x600bb.$1");
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function findCoverForTrack(query: TrackArtworkQuery): Promise<string | null> {
  // 1. If Spotify ID is available, try official Spotify oEmbed
  if (query.spotifyId && /^[a-zA-Z0-9]{22}$/.test(query.spotifyId)) {
    const spotifyCover = await fetchSpotifyOembed(query.spotifyId);
    if (spotifyCover) return spotifyCover;
  }

  const title = cleanTrackTitle(query.title);
  if (!title) return null;

  const artist = cleanArtist(query.artistName);

  // Queries in order of precision
  const searchQueries: string[] = [];
  if (artist) {
    searchQueries.push(`${artist} ${title}`);
  }
  searchQueries.push(title);
  if (artist && query.albumName) {
    const album = query.albumName.trim();
    if (album && album.toLowerCase() !== title.toLowerCase()) {
      searchQueries.push(`${artist} ${album}`);
    }
  }

  for (const q of searchQueries) {
    // 2. Deezer (1000x1000)
    const deezer = await fetchDeezerCover(q);
    if (deezer) return deezer;

    // 3. Apple Music / iTunes (600x600)
    const itunes = await fetchItunesCover(q);
    if (itunes) return itunes;
  }

  return null;
}
