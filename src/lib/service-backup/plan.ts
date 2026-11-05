import { servicePreferences } from "./preferences";
import { withHealthLock } from "@/lib/health/access";
import * as FileSystem from "expo-file-system/legacy";
import { getDb } from "@/lib/db/client";
import { createMusicSource } from "@/lib/nas/source-factory.internal";
import { createDavTransport, listWebDavDir } from "@/lib/nas/webdav-source";
import {
  isAudioFile,
  isImageFile,
  isPodcastFolderName,
  toWebDavPath,
  PROPFIND_BODY,
} from "@/lib/nas/webdav";
import { localFolder, usesLocal, usesNas } from "@/lib/settings/service-source";
import {
  podcastSourceSettings,
  videoSourceSettings,
  type NasSettings,
  type ServiceId,
} from "@/lib/settings/storage.impl";
import { readSqlHealth } from "@/lib/health/backup/sql";
import { validateHealthData, photoList } from "@/lib/health/backup/model";
import { photoExtension } from "@/lib/health/body-photos/model";
import { rawIntegrationStorage as integrationStorage } from "@/lib/integrations/storage";
import { createIntegrationCache } from "@/lib/integrations/cache";
import { hydrateTrackArtworkCache } from "@/lib/library/artwork-cache.internal";
import {
  loadWatchHistory,
  flushWatchProgress,
} from "@/lib/video/watch-history.internal";
import { loadVideoFavorites } from "@/lib/video/favorites.internal";
import { listArchiveFolder, type ArchiveFile } from "./native";
import {
  TABLES,
  validateServiceArchive,
  validArchivePath,
  type Row,
  type ServiceArchiveData,
} from "./model";
const SKIP = new Set([
  "@eadir",
  "#recycle",
  "#snapshot",
  "lost+found",
  "storyboards",
]);
function supported(path: string, service: ServiceId) {
  return service === "video"
    ? /\.(mp4|mkv|m4v|webm|avi|mov|srt|vtt|ass|ssa|nfo|jpe?g|png|webp)$/i.test(
        path,
      )
    : isAudioFile(path) || isImageFile(path);
}
function visible(path: string) {
  return path
    .split("/")
    .every((p) => !p.startsWith(".") && !SKIP.has(p.toLowerCase()));
}
function sameUri(a: string, b: string) {
  try {
    return decodeURIComponent(a) === decodeURIComponent(b);
  } catch {
    return a === b;
  }
}
async function createArchivePlanRaw(
  service: ServiceId,
  settings: NasSettings,
  password: string,
  check = () => {},
) {
  const db = await getDb();
  const media = ["music", "podcast", "video"].includes(service);
  // Refresh configured media before taking its catalogue snapshot. Source errors must not produce a falsely complete copy.
  if (service === "music" || service === "podcast") {
    check();
    const source = createMusicSource(settings, password);
    if (usesNas(settings, service) && settings.host.trim())
      await source.getAlbums();
    else if (usesLocal(settings, service) && localFolder(settings, service).uri)
      await source.getAlbums();
  }
  const data: ServiceArchiveData = {
    format: "nlc-service",
    version: 1,
    service,
    createdAt: new Date().toISOString(),
    tables: {},
    preferences: {},
    health: null,
    integrations: [],
    links: {},
    files: [],
    roots: [],
  };
  const files: ArchiveFile[] = [];
  const authSources = new Map<
    string,
    { path: string; transport: ReturnType<typeof createDavTransport> }
  >();
  const retired=new Set((await db.getAllAsync<{uri:string}>("SELECT uri FROM service_media_retired WHERE uri IS NOT NULL AND service=?",service)).map(row=>row.uri));
  const byUri = new Map<string, ArchiveFile>();
  const paths = new Set<string>();
  function add(file: ArchiveFile) {
    check();
    if (
      !validArchivePath(file.path) ||
      files.length >= 50000 ||
      paths.has(file.path)
    )
      throw new Error("format");
    files.push(file);
    paths.add(file.path);
    byUri.set(file.uri, file);
    return file.path;
  }
  if (media) {
    let folder = localFolder(settings, service);
    if (usesLocal(settings, service) && folder.uri) {
      const items = await listArchiveFolder(folder.uri);
      for (const file of items) {
        if (
          retired.has(file.uri) || !visible(file.path) ||
          !supported(file.path, service) ||
          (service === "music" && isPodcastFolderName(file.path.split("/")[0]))
        )
          continue;
        const entry = add({ ...file, path: `media/local/${file.path}` });
        if (service === "video")
          data.links[`source:/local-video/${file.path}`] = entry;
        else {
          data.links[`source:local:${file.uri}`] = entry;
          if (service === "podcast")
            data.links[`source:localpod:${file.uri}`] = entry;
        }
      }
      if (service === "video")
        data.roots.push({ from: "/local-video", to: "local" });
    } else if (
      service === "podcast" &&
      usesLocal(settings, service) &&
      settings.localFolderUri
    ) {
      const items = await listArchiveFolder(settings.localFolderUri);
      for (const file of items)
        if (
          visible(file.path) &&
          isPodcastFolderName(file.path.split("/")[0]) &&
          supported(file.path, service)
        )
          add({
            ...file,
            path: `media/local/${file.path.split("/").slice(1).join("/")}`,
          });
    }
    const conn =
      service === "video"
        ? videoSourceSettings(settings)
        : service === "podcast"
          ? podcastSourceSettings(settings)
          : settings;
    const root =
      toWebDavPath(conn.sharePath).replace(/\/+$/, "") ||
      (conn.sharePath.trim() ? "/" : "");
    const rootPrefix = root === "/" ? "" : root;
    if (usesNas(settings, service) && conn.host.trim() && root) {
      const transport = createDavTransport(conn, password);
      // Prime authentication; native streaming requests fresh authorization just before each file.
      const probe = await transport.davFetch(`${rootPrefix}/`, {
        method: "PROPFIND",
        headers: { Depth: "0", "Content-Type": "application/xml" },
        body: PROPFIND_BODY,
      });
      if (!probe.ok) throw new Error("sourceUnreadable");
      await probe.text();
      const visited = new Set<string>();
      async function walk(path: string, depth: number) {
        check();
        if (depth > 32 || visited.has(path)) throw new Error("format");
        visited.add(path);
        const entries = await listWebDavDir(conn, password, path);
        for (const item of entries) {
          check();
          const p = toWebDavPath(item.path).replace(/\/+$/, "");
          if (!p.startsWith(`${rootPrefix}/`)) throw new Error("format");
          const rel = p.slice(rootPrefix.length + 1);
          if (
            !visible(rel) ||
            (service === "music" &&
              (p === settings.podcastSharePath ||
                isPodcastFolderName(rel.split("/")[0])))
          )
            continue;
          if (item.dir) await walk(p, depth + 1);
          else if (supported(rel, service)) {
            const uri = transport.absolute(p);
            const path = add({
              path: `media/nas/${rel}`,
              uri,
              bytes: item.size,
            });
            authSources.set(uri, { path: p, transport });
            data.links[`source:${p}`] = path;
          }
        }
      }
      await walk(root, 0);
      if (service === "video") data.roots.push({ from: root, to: "nas" });
    }
    const tracks = await db.getAllAsync<Row>(
      "SELECT * FROM tracks WHERE kind = ?",
      service,
    );
    data.tables.tracks = [];
    for (const row of tracks) {
      check();
      if (
        !usesNas(settings, service) &&
        !row.local_uri &&
        !String(row.id).startsWith("local") &&
        !data.links[`source:${row.id}`]
      )
        continue;
      if (
        !(
          row.on_nas === 1 ||
          row.offline_status === "ready" ||
          String(row.id).startsWith("local")
        )
      )
        continue;
      let file =
        typeof row.local_uri === "string"
          ? files.find((f) => sameUri(f.uri, row.local_uri as string))
          : undefined;
      const remote = data.links[`source:${String(row.id)}`];
      if (!file && typeof row.local_uri === "string") {
        const info = await FileSystem.getInfoAsync(row.local_uri).catch(
          () => null,
        );
        if (info?.exists && !info.isDirectory) {
          const extension = row.local_uri.split(".").pop()?.split(/[?#]/)[0];
          const ext =
            extension && /^[a-z0-9]{1,6}$/i.test(extension)
              ? extension
              : service === "video"
                ? "mp4"
                : "mp3";
          const name =
            String(row.title)
              .replace(/[^\p{L}\p{N} ._-]/gu, "_")
              .slice(0, 80) || "media";
          const path = add({
            path: `media/offline/${data.tables.tracks.length}-${name}.${ext}`,
            uri: row.local_uri,
            bytes: info.size,
          });
          file = files.find((f) => f.path === path);
        }
      }
      const entry = file?.path || remote;
      if (!entry) throw new Error("sourceUnreadable");
      data.links[`track:${row.id}`] = entry;
      data.tables.tracks.push({
        ...row,
        local_uri: null,
        local_bytes: null,
        offline_status: "none",
      });
    }
    if (service !== "video") {
      const ids = new Set(data.tables.tracks.map((r) => r.id));
      const albums = new Set(data.tables.tracks.map((r) => r.album_id));
      const artists = new Set(data.tables.tracks.map((r) => r.artist_id));
      for (const table of TABLES[service].filter((t) => t !== "tracks")) {
        let rows = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
        if (table === "albums") rows = rows.filter((r) => albums.has(r.id));
        if (table === "artists") rows = rows.filter((r) => artists.has(r.id));
        if (table === "favorites" || table === "recents")
          rows = rows.filter((r) => ids.has(r.track_id));
        if (table === "playlist_tracks")
          rows = rows.map((r) => ({
            ...r,
            matched_id: ids.has(r.matched_id) ? r.matched_id : null,
          }));
        data.tables[table] = rows;
      }
      const meta = await hydrateTrackArtworkCache();
      data.preferences.artwork = Object.fromEntries(
        Object.entries(meta)
          .filter(([id]) => ids.has(id))
          .map(([id, value]) => {
            const copy = { ...value };
            if (copy.artworkUrl && /^https?:/.test(copy.artworkUrl)) {
              const url = new URL(copy.artworkUrl);
              if (url.username || url.password || url.search)
                delete copy.artworkUrl;
            }
            return [id, copy];
          }),
      );
      for (const row of [
        ...Object.values(
          data.preferences.artwork as Record<string, { artworkUrl?: string }>,
        ).map((value) => ({ artwork_url: value.artworkUrl ?? null }) as Row),
        ...data.tables.tracks,
        ...data.tables.albums,
        ...data.tables.artists,
        ...(data.tables.playlist_tracks ?? []),
        ...(data.tables.playlists ?? []),
      ]) {
        for (const field of ["cover_id", "artwork_url", "cover_url"]) {
          const value = row[field];
          if (typeof value !== "string" || !value) continue;
          const known =
            data.links[`cover:${value}`] ||
            files.find((f) => sameUri(f.uri, value))?.path ||
            data.links[`source:${value}`];
          if (known) {
            data.links[`cover:${value}`] = known;
            continue;
          }
          if (/^(file:|content:)/.test(value)) {
            const path = add({
              path: `media/artwork/${files.length}.jpg`,
              uri: value,
            });
            data.links[`cover:${value}`] = path;
          } else if (/^https?:/.test(value)) {
            const url = new URL(value);
            if (url.username || url.password || url.search) row[field] = null;
          }
        }
      }
    } else {
      await flushWatchProgress();
      data.preferences.watch = await loadWatchHistory();
      data.preferences.likes = await loadVideoFavorites();
    }
  } else {
    for (const table of TABLES[service])
      data.tables[table] = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
    if (service === "health") {
      data.health = await withHealthLock(async () =>
        validateHealthData((await readSqlHealth(db)).data),
      );
      for (const photo of photoList(data.health)) {
        const path = add({
          path: `media/photos/${photo.id}.${photoExtension(photo.mime)}`,
          uri: `${FileSystem.documentDirectory}health-body-photos/${photo.id}.${photoExtension(photo.mime)}`,
          bytes: photo.bytes,
        });
        data.links[`photo:${photo.id}`] = path;
      }
    }
  }
  const provider =
    service === "wealth" ? "mercury" : service === "health" ? "whoop" : null;
  if (provider) {
    const cache = createIntegrationCache(integrationStorage);
    for (const mode of ["live", "demo"] as const) {
      const copy = await cache.read(provider, mode);
      if (copy) data.integrations.push(copy);
    }
  }
  if (provider) {
    const selection = await servicePreferences.getItem(
      "nlc.integrations.selection.v1",
    );
    if (selection) {
      const mode = JSON.parse(selection)?.[provider];
      if (mode === "live" || mode === "demo")
        data.preferences.selectedMode = mode;
    }
  }
  data.files = files.map((f) => f.path);
  validateServiceArchive(data, service);
  return {
    data,
    files,
    async authorize(uri: string, retry: boolean, signal?: AbortSignal) {
      const source = authSources.get(uri);
      if (!source) throw new Error("sourceUnreadable");
      check();
      if (retry) {
        const response = await source.transport.davFetch(source.path, {
          method: "HEAD",
          signal,
        });
        await response.text();
        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status >= 500
        )
          throw new Error("sourceUnreadable");
      }
      return {
        Authorization: source.transport.session.authorization("GET", uri),
      };
    },
  };
}

import { serialize } from "@/lib/backend/write-queue";
export const createArchivePlan: typeof createArchivePlanRaw = (...args) => serialize(() => createArchivePlanRaw(...args));
