import { getAlbum, getAlbums, getArtists, getLocalUri, searchCatalog } from "@/lib/db/catalog";
import type { MusicSource, PlayableSource } from "@/lib/nas/types";
import { dumpProductivity } from "@/lib/productivity/store";
import { listReminders } from "@/lib/reminders/store";
import { dumpWealth } from "@/lib/wealth/store";

export type BridgeJson = { status: number; body: unknown };
export type BridgeStream = { uri: string; headers: Record<string, string> };
export type BridgeResult = { kind: "json"; status: number; body: unknown } | { kind: "stream" } & BridgeStream;

function queryMap(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!query) return out;
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
    const value = decodeURIComponent((eq >= 0 ? part.slice(eq + 1) : "").replace(/\+/g, " "));
    out[key] = value;
  }
  return out;
}

function pathId(path: string, prefix: string): string | undefined {
  if (!path.startsWith(prefix)) return undefined;
  const rest = path.slice(prefix.length);
  if (!rest) return undefined;
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

function playableParts(source: PlayableSource): BridgeStream {
  if (typeof source === "string") return { uri: source, headers: {} };
  return { uri: source.uri, headers: source.headers ?? {} };
}

async function first<T>(live: () => Promise<T>, cached: () => Promise<T>): Promise<T> {
  try {
    return await live();
  } catch {
    return cached();
  }
}

export async function handleBridgeRequest(
  source: MusicSource,
  path: string,
  query: string,
): Promise<BridgeResult> {
  const q = queryMap(query);
  const route = path.replace(/\/+$/, "") || "/";

  if (route === "/v1/ping") {
    const ping = await source.ping().catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : "ping",
    }));
    return { kind: "json", status: 200, body: { ok: true, nas: ping } };
  }

  if (route === "/v1/artists") {
    const artists = await first(() => source.getArtists(), () => getArtists());
    return { kind: "json", status: 200, body: { artists } };
  }

  if (route === "/v1/albums") {
    const albums = await first(() => source.getAlbums(), () => getAlbums());
    return { kind: "json", status: 200, body: { albums } };
  }

  if (route === "/v1/album" || route.startsWith("/v1/albums/")) {
    const id = q.id || pathId(route, "/v1/albums/") || pathId(route, "/v1/album/");
    if (!id) return { kind: "json", status: 400, body: { error: "missing_id" } };
    const album = await first(() => source.getAlbum(id), async () => {
      const cached = await getAlbum(id);
      if (!cached) throw new Error("missing");
      return cached;
    });
    return { kind: "json", status: 200, body: { album } };
  }

  if (route === "/v1/search") {
    const needle = (q.q ?? q.query ?? "").trim();
    const results = await first(() => source.search(needle), () => searchCatalog(needle));
    return { kind: "json", status: 200, body: results };
  }

  if (route === "/v1/stream" || route.startsWith("/v1/stream/")) {
    const id = q.id || pathId(route, "/v1/stream/");
    if (!id) return { kind: "json", status: 400, body: { error: "missing_id" } };
    const local = await getLocalUri(id);
    if (local) return { kind: "stream", uri: local, headers: {} };
    const playable = await source.streamUrl(id);
    return { kind: "stream", ...playableParts(playable) };
  }

  if (route === "/v1/cover" || route.startsWith("/v1/cover/")) {
    const id = q.id || pathId(route, "/v1/cover/");
    if (!id) return { kind: "json", status: 400, body: { error: "missing_id" } };
    const url = await source.coverUrl(id);
    if (!url) return { kind: "json", status: 404, body: { error: "no_cover" } };
    return { kind: "json", status: 200, body: { url } };
  }

  if (route === "/v1/focus") {
    const [{ projects, tasks }, reminders] = await Promise.all([dumpProductivity(), listReminders()]);
    return { kind: "json", status: 200, body: { version: 1, projects, tasks, reminders } };
  }

  if (route === "/v1/wealth") {
    const dump = await dumpWealth();
    return { kind: "json", status: 200, body: dump };
  }

  return { kind: "json", status: 404, body: { error: "not_found" } };
}
