import { Platform } from "react-native";
import { collateLocale, t } from "@/lib/i18n/runtime";
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
import { replaceLibrary } from "@/lib/db/catalog";
import { createDavAuthSession } from "@/lib/nas/dav-auth";
import {
  PROPFIND_BODY,
  buildIndex,
  isAudioFile,
  isCoverFile,
  isImageFile,
  isPathInside,
  isPodcastAlbum,
  isPodcastTrack,
  sidecarCoverPath,
  sidecarKeys,
  toWebDavPath,
  parseHtmlIndex,
  parsePropfind,
  setPodcastRootHint,
  type WebDavEntry,
  type WebDavIndex,
} from "@/lib/nas/webdav";
import { requestOfflineSync } from "@/lib/offline/downloader";

const WEB_NAS_GET = ["/api/nas-files", "/api/spotify-embed"];
const WEB_NAS_POST = ["/api/nas-files", "/api/spotify-embed"];

function isHtml404(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return response.status === 404 && (type.includes("text/html") || type.includes("text/plain"));
}

async function webGet(nasUrl: string, headers: Record<string, string>, method = "GET"): Promise<Response> {
  let last: Response | null = null;
  for (const base of WEB_NAS_GET) {
    const response = await fetch(`${base}?u=${encodeURIComponent(nasUrl)}`, { method, headers });
    if (isHtml404(response)) {
      last = response;
      continue;
    }
    return response;
  }
  return last ?? new Response(t("nasExtra.noNasProxy"), { status: 502 });
}

async function webMutate(
  nasUrl: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<Response> {
  const payload = JSON.stringify({ url: nasUrl, method, headers, body });
  let last: Response | null = null;
  for (const route of WEB_NAS_POST) {
    const response = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    if (isHtml404(response)) {
      last = response;
      continue;
    }
    return response;
  }
  return last ?? new Response(t("nasExtra.noNasProxy"), { status: 502 });
}

function webNasUri(nasUrl: string, extra?: Record<string, string>): string {
  const qs = new URLSearchParams({ u: nasUrl, ...extra });
  return `/api/spotify-embed?${qs.toString()}`;
}

const nativeCoverCache = new Map<string, string>();

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === "function") return btoa(binary);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += chars[(n >> 18) & 63];
    out += chars[(n >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? chars[n & 63] : "=";
  }
  return out;
}

function isLanHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    const parts = host.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
    const [a, b] = parts;
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && (b ?? 0) >= 16 && (b ?? 0) <= 31);
  } catch {
    return false;
  }
}

function encodeDavPath(path: string): string {
  return path
    .split("/")
    .map((part) => (part ? encodeURIComponent(part) : ""))
    .join("/");
}

function createDavTransport(settings: NasSettings, password: string) {
  const rootPath = toWebDavPath(settings.sharePath);
  const session = createDavAuthSession(settings.username.trim(), password);

  function absolute(path: string): string {
    return `${nasBaseUrl(settings)}${encodeDavPath(toWebDavPath(path) || path)}`;
  }

  async function davFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const nasUrl = path.startsWith("http") ? path : absolute(path);
    const method = (init.method ?? "GET").toUpperCase();
    return session.fetch(nasUrl, method, async (authorization) => {
      const headers = {
        ...(authorization ? { Authorization: authorization } : {}),
        ...(init.headers as Record<string, string> | undefined),
      };
      if (Platform.OS === "web") {
        if (method === "GET" || method === "HEAD") {
          return webGet(nasUrl, headers, method);
        }
        return webMutate(nasUrl, method, headers, typeof init.body === "string" ? init.body : undefined);
      }
      return fetch(nasUrl, { ...init, headers });
    });
  }

  return { rootPath, session, absolute, davFetch };
}

export async function probeWebDav(settings: NasSettings, password: string): Promise<boolean> {
  try {
    if (!settings.host.trim() || !settings.username.trim() || !settings.sharePath.trim() || !password) return false;
    if (!isLanHttpUrl(nasBaseUrl(settings))) return false;
    const { rootPath, davFetch } = createDavTransport(settings, password);
    const listed = await davFetch(rootPath.endsWith("/") ? rootPath : `${rootPath}/`);
    return listed.ok;
  } catch {
    return false;
  }
}

/** Auth + reachability only. Does not require a music share path. */
export async function pingNasConnection(settings: NasSettings, password: string): Promise<PingResult> {
  try {
    if (!settings.host.trim()) return { ok: false, message: t("nas.missingHost") };
    if (!settings.username.trim() && !password) {
      return { ok: false, message: t("nas.missingUserPass") };
    }
    if (!settings.username.trim()) return { ok: false, message: t("nas.missingUser") };
    if (!password) return { ok: false, message: t("nas.missingPass") };
    if (!isLanHttpUrl(nasBaseUrl(settings))) {
      return { ok: false, message: t("nas.lanOnly") };
    }
    const { davFetch } = createDavTransport({ ...settings, sharePath: "/" }, password);
    const listed = await davFetch("/", {
      method: "PROPFIND",
      headers: {
        Depth: "0",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: PROPFIND_BODY,
    });
    if (listed.status === 401) return { ok: false, message: t("nas.badAuth") };
    if (listed.ok || listed.status === 207) {
      return { ok: true, message: t("nas.connected"), serverName: "NAS" };
    }
    const fallback = await davFetch("/");
    if (fallback.status === 401) return { ok: false, message: t("nas.badAuth") };
    if (fallback.ok) {
      return { ok: true, message: t("nas.connected"), serverName: "NAS" };
    }
    return { ok: false, message: t("nas.httpFail", { status: listed.status }) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : t("nas.connectFail"),
    };
  }
}

const MKCOL_OK = new Set([200, 201, 204, 301, 405, 409]);

function dirEntries(path: string, raw: WebDavEntry[]): WebDavEntry[] {
  const self = path.replace(/\/+$/, "") || "/";
  const seen = new Set<string>();
  const entries: WebDavEntry[] = [];
  for (const entry of raw) {
    const normalized = entry.path.replace(/\/+$/, "") || "/";
    if (normalized === self || seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push({ ...entry, path: normalized });
  }
  entries.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.name.localeCompare(b.name, collateLocale(), { sensitivity: "base" });
  });
  return entries;
}

/** Immediate children of `path`. Uses `/` as WebDAV root (not the music share). */
export async function listWebDavDir(
  settings: NasSettings,
  password: string,
  path: string,
): Promise<WebDavEntry[]> {
  const davPath = toWebDavPath(path) || "/";
  const dirPath = davPath.endsWith("/") ? davPath : `${davPath}/`;
  const { davFetch } = createDavTransport({ ...settings, sharePath: "/" }, password);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(t("nas.timeout"))),
      10_000,
    );
  });
  try {
    return await Promise.race([listWebDavDirOnce(davFetch, davPath, dirPath), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function listWebDavDirOnce(
  davFetch: (path: string, init?: RequestInit) => Promise<Response>,
  davPath: string,
  dirPath: string,
): Promise<WebDavEntry[]> {
  try {
    const propfind = await davFetch(dirPath, {
      method: "PROPFIND",
      headers: {
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: PROPFIND_BODY,
    });
    if (propfind.status === 401) throw new Error(t("nas.badAuth"));
    if (propfind.ok || propfind.status === 207) {
      return dirEntries(davPath, parsePropfind(await propfind.text()));
    }
    if (propfind.status === 404) {
      throw new Error(t("nas.missingPath"));
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("password") ||
        error.message.includes("incorrect") ||
        error.message.includes("incorrectos") ||
        error.message.includes("not on the server") ||
        error.message.includes("No existe"))
    ) {
      throw error;
    }
  }

  const listed = await davFetch(dirPath);
  const listedBody = await listed.text();
  if (listed.status === 401) throw new Error(t("nas.badAuth"));
  if (listed.status === 404) {
    throw new Error(t("nas.missingPath"));
  }
  if (!listed.ok) {
    throw new Error(t("nasExtra.httpResponded", { status: listed.status }));
  }
  return dirEntries(davPath, parseHtmlIndex(listedBody, davPath));
}

/** Create `path` and missing parents. Existing folders count as success. */
export async function ensureWebDavDir(
  settings: NasSettings,
  password: string,
  path: string,
): Promise<void> {
  const normalized = toWebDavPath(path);
  if (!normalized || normalized === "/") return;
  const { davFetch } = createDavTransport({ ...settings, sharePath: "/" }, password);
  const parts = normalized.split("/").filter(Boolean);
  let cursor = "";
  for (const part of parts) {
    cursor += `/${part}`;
    const exists = await davFetch(`${cursor}/`, {
      method: "PROPFIND",
      headers: {
        Depth: "0",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: PROPFIND_BODY,
    });
    if (exists.ok || exists.status === 207) continue;
    const created = await davFetch(cursor, { method: "MKCOL" });
    if (created.status === 401) throw new Error(t("nas.badAuth"));
    if (created.status === 403) {
      throw new Error(t("nasExtra.writeDenied"));
    }
    if (MKCOL_OK.has(created.status) || created.ok) continue;
    const body = await created.text();
    throwIfDavWriteFailed(created, body);
  }
}

function throwIfDavWriteFailed(response: Response, body: string): void {
  let proxyError = "";
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) proxyError = parsed.error;
  } catch {
    // HTML or empty WebDAV body.
  }
  if (response.status === 401) throw new Error(t("nas.badAuth"));
  if (response.status === 403) {
    throw new Error(t("nasExtra.writeDenied"));
  }
  if (response.status === 404) throw new Error(t("nasExtra.shareMissing"));
  if (response.status === 405) {
    throw new Error(t("nasExtra.methodDenied"));
  }
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(proxyError || t("nasExtra.writeFail"));
  }
}

export async function getWebDavText(
  settings: NasSettings,
  password: string,
  path: string,
): Promise<string> {
  const { davFetch } = createDavTransport(settings, password);
  const response = await davFetch(path, { method: "GET" });
  const body = await response.text();
  if (response.status === 404) {
    throw new Error(t("nasExtra.configMissing"));
  }
  if (response.status === 401) throw new Error(t("nas.badAuth"));
  if (!response.ok) {
    throw new Error(t("nasExtra.httpResponded", { status: response.status }));
  }
  return body;
}

export async function putWebDavText(
  settings: NasSettings,
  password: string,
  path: string,
  text: string,
): Promise<void> {
  const { davFetch } = createDavTransport(settings, password);
  const response = await davFetch(path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Overwrite: "T",
    },
    body: text,
  });
  const body = await response.text();
  throwIfDavWriteFailed(response, body);
}

export async function putWebDavBytes(
  settings: NasSettings,
  password: string,
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { davFetch } = createDavTransport(settings, password);
  const response = await davFetch(path, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || "image/jpeg",
      Overwrite: "T",
    },
    body: bytes as unknown as BodyInit,
  });
  const body = await response.text();
  throwIfDavWriteFailed(response, body);
}

export async function deleteWebDavFile(
  settings: NasSettings,
  password: string,
  path: string,
): Promise<void> {
  const { davFetch } = createDavTransport(settings, password);
  const response = await davFetch(path, { method: "DELETE" });
  const body = await response.text();
  let proxyError = "";
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) proxyError = parsed.error;
  } catch {
    // HTML or empty WebDAV body.
  }
  if (response.status === 401) throw new Error(t("nas.badAuth"));
  if (response.status === 403) {
    throw new Error(t("nasExtra.writeDenied"));
  }
  // Already gone — treat as success so the app can purge recents/favorites.
  if (response.status === 404) return;
  if (response.status === 405) {
    throw new Error(t("nasExtra.methodDenied"));
  }
  // 204 No Content / 200 OK are success; some servers also return 202.
  if (!response.ok && response.status !== 204) {
    throw new Error(proxyError || t("nasExtra.deleteFail"));
  }
}

export async function moveWebDavPath(
  settings: NasSettings,
  password: string,
  from: string,
  to: string,
): Promise<void> {
  const { davFetch, absolute } = createDavTransport(settings, password);
  const response = await davFetch(from, {
    method: "MOVE",
    headers: {
      Destination: absolute(to),
      Overwrite: "F",
    },
  });
  const body = await response.text();
  throwIfDavWriteFailed(response, body);
}

export function createWebDavSource(settings: NasSettings, password: string): MusicSource {
  const { rootPath, session, absolute, davFetch } = createDavTransport(settings, password);
  const podcastRoot = toWebDavPath(settings.podcastSharePath);
  setPodcastRootHint(podcastRoot);
  let index: WebDavIndex | null = null;
  let scanPromise: Promise<WebDavIndex> | null = null;

  function playable(path: string): PlayableSource {
    const nasUrl = absolute(path);
    const headers = { Authorization: session.authorization("GET", nasUrl) };
    if (Platform.OS === "web") {
      return {
        uri: webNasUri(nasUrl),
        headers,
      };
    }
    return { uri: nasUrl, headers };
  }

  async function listDir(path: string): Promise<WebDavEntry[]> {
    const davPath = toWebDavPath(path) || path;
    const dirPath = davPath.endsWith("/") ? davPath : `${davPath}/`;
    if (Platform.OS !== "web") {
      try {
        const propfind = await davFetch(dirPath, {
          method: "PROPFIND",
          headers: {
            Depth: "1",
            "Content-Type": "application/xml; charset=utf-8",
          },
          body: PROPFIND_BODY,
        });
        if (propfind.ok) {
          const entries = parsePropfind(await propfind.text()).filter((entry) => {
            const normalized = entry.path.replace(/\/+$/, "") || "/";
            const self = davPath.replace(/\/+$/, "") || "/";
            return normalized !== self;
          });
          if (entries.length) return entries;
        }
      } catch {
        // HTML listing fallback.
      }
    }

    const listed = await davFetch(dirPath);
    const listedBody = await listed.text();
    if (listed.status === 401) throw new Error(t("nas.badAuth"));
    if (!listed.ok) {
      if (listed.status === 404 && listedBody.includes("expo-reset")) {
        throw new Error(t("nasExtra.browserNoNas"));
      }
      if (listed.status === 404) {
        throw new Error(t("nas.missingPath"));
      }
      throw new Error(t("nasExtra.httpResponded", { status: listed.status }));
    }
    return parseHtmlIndex(listedBody, davPath.replace(/\/+$/, "") || "/");
  }

  async function scan(): Promise<WebDavIndex> {
    if (index) return index;
    if (scanPromise) return scanPromise;
    scanPromise = (async () => {
      const files: WebDavEntry[] = [];
      const covers = new Map<string, string>();
      const sidecars = new Map<string, string>();
      if (!rootPath) throw new Error(t("nasExtra.missingMusicPath"));
      const queue = [rootPath];
      if (podcastRoot && !isPathInside(rootPath, podcastRoot)) queue.push(podcastRoot);
      const seen = new Set<string>();
      let dirs = 0;

      while (queue.length && files.length < 8000 && dirs < 2500) {
        const current = queue.shift() ?? "";
        const key = current.replace(/\/+$/, "") || "/";
        if (seen.has(key)) continue;
        seen.add(key);
        dirs += 1;
        let entries: WebDavEntry[] = [];
        try {
          entries = await listDir(key);
        } catch (error) {
          if (key === rootPath) throw error;
          continue;
        }
        for (const entry of entries) {
          if (entry.dir) {
            queue.push(entry.path);
            continue;
          }
          if (isCoverFile(entry.name)) {
            const parent = entry.path.replace(/\/[^/]+$/, "") || rootPath;
            if (!covers.has(parent)) covers.set(parent, entry.path);
            continue;
          }
          if (isImageFile(entry.name)) {
            for (const key of sidecarKeys(entry.path)) {
              if (!sidecars.has(key)) sidecars.set(key, entry.path);
            }
            continue;
          }
          if (isAudioFile(entry.name)) files.push(entry);
        }
      }

      const next = buildIndex(rootPath, files, covers, sidecars, podcastRoot);
      const sizes = new Map<string, number>();
      for (const file of files) {
        if (file.size && file.size > 0) sizes.set(file.path, file.size);
      }
      try {
        await replaceLibrary(next, sizes);
        requestOfflineSync();
      } catch (error) {
        console.warn("No se pudo guardar el catálogo", error);
      }
      index = next;
      return next;
    })();
    try {
      return await scanPromise;
    } finally {
      scanPromise = null;
    }
  }

  function matches(haystack: string, q: string): boolean {
    const blob = haystack.toLowerCase();
    const tokens = q
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!tokens.length) return false;
    return tokens.every((token) => blob.includes(token));
  }

  return {
    kind: "webdav",

    async ping(): Promise<PingResult> {
      try {
        if (!settings.host.trim()) return { ok: false, message: t("nas.missingHost") };
        if (!rootPath) return { ok: false, message: t("nas.missingPath") };
        if (!settings.username.trim() && !password) {
          return { ok: false, message: t("nas.missingUserPass") };
        }
        if (!settings.username.trim()) return { ok: false, message: t("nas.missingUser") };
        if (!password) return { ok: false, message: t("nas.missingPass") };
        if (!isLanHttpUrl(nasBaseUrl(settings))) {
          return { ok: false, message: t("nas.lanOnly") };
        }
        const listed = await listDir(rootPath);
        const dirs = listed.filter((entry) => entry.dir).length;
        const files = listed.filter((entry) => !entry.dir).length;
        if (!dirs && !files) {
          return {
            ok: true,
            message: t("nasExtra.connectedEmptyPath", { path: rootPath }),
            serverName: "NAS",
          };
        }
        index = null;
        const library = await scan();
        const musicTracks = library.tracks.filter((track) => !isPodcastTrack(track));
        const musicAlbums = library.albums.filter((album) => !isPodcastAlbum(album));
        return {
          ok: true,
          message: t("nasExtra.connectedStats", {
            tracks: musicTracks.length,
            albums: musicAlbums.length,
          }),
          serverName: "NAS",
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : t("nas.connectFail"),
        };
      }
    },

    async getArtists(): Promise<Artist[]> {
      const library = await scan();
      return library.artists;
    },

    async getAlbums(): Promise<Album[]> {
      const library = await scan();
      return library.albums;
    },

    async getAlbum(id: string): Promise<AlbumDetail> {
      const library = await scan();
      const album = library.albums.find((item) => item.id === id);
      if (!album) throw new Error(t("nasExtra.albumMissing"));
      return { ...album, tracks: library.albumTracks[id] ?? [] };
    },

    async getTracks(albumId: string): Promise<Track[]> {
      const album = await this.getAlbum(albumId);
      return album.tracks;
    },

    async search(q: string): Promise<SearchResults> {
      const library = await scan();
      if (!q.trim() || q.trim() === "*") {
        return { artists: library.artists, albums: library.albums, tracks: library.tracks };
      }
      return {
        artists: library.artists.filter((item) => matches(item.name, q)),
        albums: library.albums.filter((item) => matches(item.name, q) || matches(item.artistName, q)),
        tracks: library.tracks.filter((item) =>
          matches(`${item.title} ${item.artistName} ${item.albumName}`, q),
        ),
      };
    },

    async streamUrl(trackId: string): Promise<PlayableSource> {
      if (!trackId.startsWith("/")) throw new Error(t("nasExtra.invalidTrack"));
      return playable(trackId);
    },

    async coverUrl(id: string): Promise<string | null> {
      if (!id) return null;
      const nasUrl = absolute(id);
      const cached = nativeCoverCache.get(nasUrl);
      if (cached) return cached;
      try {
        const response = await davFetch(nasUrl);
        if (!response.ok) return null;
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength) return null;
        const type = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim();
        if (!type.startsWith("image/")) return null;
        const uri = `data:${type};base64,${arrayBufferToBase64(bytes)}`;
        nativeCoverCache.set(nasUrl, uri);
        return uri;
      } catch {
        return null;
      }
    },

    async deleteTrack(trackId: string): Promise<void> {
      if (!trackId.startsWith("/")) throw new Error(t("nasExtra.invalidTrack"));
      await deleteWebDavFile(settings, password, trackId);
      index = null;
      scanPromise = null;
    },

    async ensureCoverSidecar(trackId: string, imageUrl: string): Promise<string | null> {
      if (Platform.OS === "web") return null;
      if (!trackId.startsWith("/") || !imageUrl.trim()) return null;
      if (
        isPodcastTrack({
          id: trackId,
          albumId: "",
          albumName: "",
          artistName: "",
        })
      ) {
        return null;
      }
      const dest = sidecarCoverPath(trackId, "jpg");
      const existing = await davFetch(dest, { method: "HEAD" });
      if (existing.ok) return dest;
      if (existing.status !== 404 && existing.status !== 405) {
        const probe = await davFetch(dest, { method: "GET" });
        if (probe.ok) return dest;
      }
      const image = await fetch(imageUrl.trim());
      if (!image.ok) return null;
      const type = (image.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim();
      if (!type.startsWith("image/")) return null;
      const bytes = await image.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 2_500_000) return null;
      const response = await davFetch(dest, {
        method: "PUT",
        headers: {
          "Content-Type": type.includes("png") ? "image/png" : "image/jpeg",
          Overwrite: "F",
        },
        body: bytes as unknown as BodyInit,
      });
      const body = await response.text();
      if (response.status === 412 || response.status === 409) return dest;
      throwIfDavWriteFailed(response, body);
      index = null;
      scanPromise = null;
      return dest;
    },
  };
}
