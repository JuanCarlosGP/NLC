import { Platform } from "react-native";
import type { NasSettings } from "@/lib/settings/storage";
import { nasBaseUrl, videoSourceSettings } from "@/lib/settings/storage";
import type { PlayableSource } from "@/lib/nas/types";
import {
  PROPFIND_BODY,
  basicAuthHeader,
  parseHtmlIndex,
  parsePropfind,
  toWebDavPath,
  type WebDavEntry,
} from "@/lib/nas/webdav";

const WEB_NAS_GET = ["/api/nas-files", "/api/spotify-embed"];

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

function encodeDavPath(path: string): string {
  return path
    .split("/")
    .map((part) => (part ? encodeURIComponent(part) : ""))
    .join("/");
}

function webNasUri(nasUrl: string): string {
  return `/api/spotify-embed?u=${encodeURIComponent(nasUrl)}`;
}

export function createVideoDavClient(settings: NasSettings, password: string) {
  const conn = videoSourceSettings(settings);
  const auth = basicAuthHeader(conn.username.trim(), password);

  function absolute(path: string): string {
    return `${nasBaseUrl(conn)}${encodeDavPath(toWebDavPath(path) || path)}`;
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
      return webGet(nasUrl, headers, method);
    }
    return fetch(nasUrl, { ...init, headers });
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
    if (listed.status === 401) throw new Error("Usuario o contraseña incorrectos.");
    if (!listed.ok) {
      if (listed.status === 404) {
        throw new Error(
          `No se encuentra «${path.replace(/\/+$/, "") || "/"}» en el NAS. Comprueba la carpeta de vídeo en Ajustes.`,
        );
      }
      throw new Error(`El NAS respondió HTTP ${listed.status}.`);
    }
    return parseHtmlIndex(listedBody, davPath.replace(/\/+$/, "") || "/");
  }

  function playable(path: string): PlayableSource {
    const nasUrl = absolute(path);
    const headers = { Authorization: auth };
    if (Platform.OS === "web") {
      return { uri: webNasUri(nasUrl), headers };
    }
    return { uri: nasUrl, headers };
  }

  return { listDir, playable, absolute, auth };
}
