import { Platform } from "react-native";
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
import {
  PROPFIND_BODY,
  basicAuthHeader,
  buildIndex,
  isAudioFile,
  isCoverFile,
  normalizeSharePath,
  parseHtmlIndex,
  parsePropfind,
  type WebDavEntry,
  type WebDavIndex,
} from "@/lib/nas/webdav";

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
  return last ?? new Response("No hay proxy del NAS.", { status: 502 });
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
  return last ?? new Response("No hay proxy del NAS.", { status: 502 });
}

function webNasUri(nasUrl: string, extra?: Record<string, string>): string {
  const qs = new URLSearchParams({ u: nasUrl, ...extra });
  return `/api/spotify-embed?${qs.toString()}`;
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
  const rootPath = normalizeSharePath(settings.sharePath || "/Music");
  const auth = basicAuthHeader(settings.username.trim(), password);

  function absolute(path: string): string {
    return `${nasBaseUrl(settings)}${encodeDavPath(path)}`;
  }

  async function davFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const nasUrl = path.startsWith("http") ? path : absolute(path);
    const headers = {
      Authorization: auth,
      ...(init.headers as Record<string, string> | undefined),
    };
    if (Platform.OS === "web") {
      const method = (init.method ?? "GET").toUpperCase();
      if (method === "GET" || method === "HEAD") {
        return webGet(nasUrl, headers, method);
      }
      return webMutate(nasUrl, method, headers, typeof init.body === "string" ? init.body : undefined);
    }
    return fetch(nasUrl, { ...init, headers });
  }

  return { rootPath, auth, absolute, davFetch };
}

export async function probeWebDav(settings: NasSettings, password: string): Promise<boolean> {
  try {
    if (!settings.host.trim() || !settings.username.trim() || !password) return false;
    if (!isLanHttpUrl(nasBaseUrl(settings))) return false;
    const { rootPath, davFetch } = createDavTransport(settings, password);
    const listed = await davFetch(rootPath.endsWith("/") ? rootPath : `${rootPath}/`);
    return listed.ok;
  } catch {
    return false;
  }
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
  let proxyError = "";
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) proxyError = parsed.error;
  } catch {
    // HTML or empty WebDAV body.
  }
  if (response.status === 401) throw new Error("Usuario o contraseña incorrectos.");
  if (response.status === 403) {
    throw new Error(
      "El usuario no tiene permiso de escritura en esa carpeta. En el NAS, dale a Viewer permiso de escritura sobre /Music.",
    );
  }
  if (response.status === 404) throw new Error("No existe la carpeta de la compartición. Revisa la ruta.");
  if (response.status === 405) {
    throw new Error("El NAS no permite crear archivos por WebDAV con esta cuenta.");
  }
  if (!response.ok) {
    throw new Error(proxyError || `El NAS respondió HTTP ${response.status} al guardar el archivo.`);
  }
}

export function createWebDavSource(settings: NasSettings, password: string): MusicSource {
  const { rootPath, auth, absolute, davFetch } = createDavTransport(settings, password);
  let index: WebDavIndex | null = null;
  let scanPromise: Promise<WebDavIndex> | null = null;

  function playable(path: string): PlayableSource {
    const nasUrl = absolute(path);
    const headers = { Authorization: auth };
    if (Platform.OS === "web") {
      return {
        uri: webNasUri(nasUrl),
        headers,
      };
    }
    return { uri: nasUrl, headers };
  }

  async function listDir(path: string): Promise<WebDavEntry[]> {
    const dirPath = path.endsWith("/") ? path : `${path}/`;
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
            const self = path.replace(/\/+$/, "") || "/";
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
    if (listed.status === 401) throw new Error("Usuario o contraseña incorrectos.");
    if (!listed.ok) {
      if (listed.status === 404 && listedBody.includes("expo-reset")) {
        throw new Error("El navegador no está llegando al NAS. Reinicia expo start y vuelve a probar.");
      }
      if (listed.status === 404) {
        throw new Error(
          `No existe «${path.replace(/\/+$/, "") || "/"}» en el servidor. Prueba /Music (el nombre de la compartición, no /volume1/…).`,
        );
      }
      throw new Error(`El NAS respondió HTTP ${listed.status}.`);
    }
    return parseHtmlIndex(listedBody, path.replace(/\/+$/, "") || "/");
  }

  async function scan(): Promise<WebDavIndex> {
    if (index) return index;
    if (scanPromise) return scanPromise;
    scanPromise = (async () => {
      const files: WebDavEntry[] = [];
      const covers = new Map<string, string>();
      const queue = [rootPath];
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
          if (isAudioFile(entry.name)) files.push(entry);
        }
      }

      const next = buildIndex(rootPath, files, covers);
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
    return haystack.toLowerCase().includes(q.trim().toLowerCase());
  }

  return {
    kind: "webdav",

    async ping(): Promise<PingResult> {
      try {
        if (!settings.host.trim()) return { ok: false, message: "Falta la IP del servidor." };
        if (!settings.username.trim() && !password) {
          return { ok: false, message: "Faltan el usuario y la contraseña." };
        }
        if (!settings.username.trim()) return { ok: false, message: "Falta el usuario." };
        if (!password) return { ok: false, message: "Falta la contraseña." };
        if (!isLanHttpUrl(nasBaseUrl(settings))) {
          return { ok: false, message: "La IP tiene que ser de tu red local." };
        }
        const listed = await listDir(rootPath);
        const dirs = listed.filter((entry) => entry.dir).length;
        const files = listed.filter((entry) => !entry.dir).length;
        if (!dirs && !files) {
          return {
            ok: true,
            message: `Hay conexión, pero ${rootPath} está vacía.`,
            serverName: "Carpeta compartida",
          };
        }
        index = null;
        const library = await scan();
        return {
          ok: true,
          message: `Hay conexión. ${library.tracks.length} canciones en ${library.albums.length} álbumes.`,
          serverName: "Carpeta compartida",
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "No se pudo conectar al NAS.",
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
      if (!album) throw new Error("Álbum no encontrado.");
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
        tracks: library.tracks.filter(
          (item) => matches(item.title, q) || matches(item.artistName, q) || matches(item.albumName, q),
        ),
      };
    },

    async streamUrl(trackId: string): Promise<PlayableSource> {
      if (!trackId.startsWith("/")) throw new Error("Pista WebDAV no válida.");
      return playable(trackId);
    },

    async coverUrl(id: string): Promise<string | null> {
      if (!id) return null;
      const nasUrl = absolute(id);
      if (Platform.OS === "web") {
        const token = auth.replace(/^Basic\s+/i, "");
        return webNasUri(nasUrl, { a: token });
      }
      try {
        const url = new URL(nasUrl);
        url.username = settings.username.trim();
        url.password = password;
        return url.toString();
      } catch {
        return nasUrl;
      }
    },
  };
}
