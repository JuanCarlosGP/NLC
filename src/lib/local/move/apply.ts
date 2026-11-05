import {
  SERVICES,
  localFolder,
  withLocalFolder,
} from "@/lib/settings/service-source";
import type { CatalogDb } from "@/lib/db/types";
import type { NasSettings } from "@/lib/settings/storage";
import { preferenceKey } from "@/lib/service-backup/preferences";
import { importEpochKey } from "@/lib/service-backup/epochs";
import { seriesFromPath } from "@/lib/video/browse";
import { encodeVideoPath } from "@/lib/video/catalog";
import { moveFingerprint } from "./plan";
import type { MovedFile, MoveSummary } from "./native";
export const MOVE_PREFS = [
  "nlc.track-meta.v2",
  "nlc.video.watch.v2",
  "nlc.video.likes.v1",
] as const;
export type MovePreferences = Record<string, string | null>;
// Caller owns an isolated SQL transaction. Receipt and paths commit together.
export async function applyMove(
  db: CatalogDb,
  job: MoveSummary,
  files: MovedFile[],
  fallback: MovePreferences,
) {
  const receipt = `local_move_receipt:${job.id}`;
  if (await db.getFirstAsync("SELECT value FROM meta WHERE key = ?", receipt))
    throw new Error("committed");
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'nas_settings'",
  );
  const current: NasSettings = row
    ? JSON.parse(row.value)
    : (job.metadata.source ?? job.metadata.target);
  if (moveFingerprint(current) !== job.metadata.fingerprint)
    throw new Error("settingsChanged");
  const desired = job.metadata.target;
  let target: NasSettings = {
    ...current,
    sourceKind: desired.sourceKind,
    serviceSources: desired.serviceSources,
    localRootFolderUri: desired.localRootFolderUri,
    localRootFolderName: desired.localRootFolderName,
  };
  for (const service of SERVICES) {
    const folder = localFolder(desired, service);
    target = withLocalFolder(target, service, folder.uri, folder.name);
  }
  const uris = new Map<string, string>(),
    ids = new Map<string, string>(),
    video = new Map<string, string>();
  const tracks = await db.getAllAsync<{ id: string; kind: string }>(
      "SELECT id, kind FROM tracks",
    ),
    known = new Map(tracks.map((t) => [t.id, t.kind]));
  const paths = new Map<string, MovedFile>();
  const assigned = new Set<string>();
  function videoAliases(from: string, to: string) {
    video.set(from, to);
    const a = from.split("/"),
      b = to.split("/");
    for (let i = 2; i < Math.min(a.length, b.length); i++) {
      const prefix = a.slice(0, i).join("/");
      if (!video.has(prefix)) video.set(prefix, b.slice(0, i).join("/"));
    }
  }
  for (const file of files) {
    if (
      !file.uri ||
      !file.path ||
      file.path.split("/").some((p) => !p || p === "." || p === "..")
    )
      throw new Error("integrity");
    if (!uris.has(file.source)) uris.set(file.source, file.uri);
    for (const ref of file.refs) {
      if (ref.startsWith("uri:")) {
        if (!uris.has(ref.slice(4))) uris.set(ref.slice(4), file.uri);
      }
      if (!ref.startsWith("track:") || !known.has(ref.slice(6))) continue;
      const old = ref.slice(6),
        id =
          file.service === "video"
            ? `/local-video/${file.path}`
            : `${file.service === "podcast" ? "localpod" : "local"}:${file.uri}`;
      if (id !== old && (known.has(id) || assigned.has(id)))
        throw new Error("conflict");
      assigned.add(id);
      ids.set(old, id);
      paths.set(old, file);
      if (file.service === "video") videoAliases(old, id);
    }
    if (file.service === "video")
      videoAliases(
        `/local-video/${file.relative}`,
        `/local-video/${file.path}`,
      );
  }
  for (const [old, id] of ids) {
    const file = paths.get(old)!;
    await db.runAsync(
      "UPDATE tracks SET id = ?, local_uri = ?, local_bytes = CASE WHEN ? > 0 THEN ? ELSE local_bytes END, offline_status = 'ready', on_nas = 0 WHERE id = ?",
      id,
      file.uri,
      file.bytes,
      file.bytes,
      old,
    );
    for (const [table, column] of [
      ["favorites", "track_id"],
      ["recents", "track_id"],
      ["playlist_tracks", "matched_id"],
      ["service_media_origins", "track_id"],
    ])
      await db.runAsync(
        `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
        id,
        old,
      );
  }
  const usedCovers = new Set(
    (
      await db.getAllAsync<{ uri: string }>(
        `SELECT cover_id AS uri FROM tracks UNION SELECT artwork_url AS uri FROM tracks UNION SELECT cover_id AS uri FROM artists UNION SELECT cover_id AS uri FROM albums UNION SELECT cover_url AS uri FROM playlists UNION SELECT cover_url AS uri FROM playlist_tracks`,
      )
    ).map((row) => row.uri),
  );
  for (const [from, to] of uris)
    if (from !== to && usedCovers.has(from))
      for (const [table, column] of [
        ["tracks", "cover_id"],
        ["tracks", "artwork_url"],
        ["artists", "cover_id"],
        ["albums", "cover_id"],
        ["playlists", "cover_url"],
        ["playlist_tracks", "cover_url"],
      ])
        await db.runAsync(
          `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
          to,
          from,
        );
  for (const key of MOVE_PREFS) {
    const stored = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = ?",
      preferenceKey(key),
    );
    const raw = stored?.value ?? fallback[key];
    if (!raw) continue;
    const data = JSON.parse(raw);
    let mapped: unknown;
    if (key === "nlc.track-meta.v2")
      mapped = Object.fromEntries(
        Object.entries(data as Record<string, { artworkUrl?: string }>).map(
          ([id, meta]) => [
            ids.get(id) ?? id,
            {
              ...meta,
              ...(meta.artworkUrl
                ? { artworkUrl: uris.get(meta.artworkUrl) ?? meta.artworkUrl }
                : {}),
            },
          ],
        ),
      );
    else
      mapped = (data as Record<string, unknown>[]).map((entry) => {
        const before = String(entry.path),
          path = video.get(before) ?? before;
        return key === "nlc.video.likes.v1"
          ? { ...entry, path, id: encodeVideoPath(path) }
          : {
              ...entry,
              path,
              arcPath: video.get(String(entry.arcPath)) ?? entry.arcPath,
              sagaPath: video.get(String(entry.sagaPath)) ?? entry.sagaPath,
              seriesId:
                before === path ? entry.seriesId : seriesFromPath(path).id,
            };
      });
    await db.runAsync(
      "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
      preferenceKey(key),
      JSON.stringify(mapped),
    );
  }
  for (const service of ["focus", "wealth"] as const)
    await db.runAsync(
      "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
      importEpochKey(service),
      String(Date.now()),
    );
  await db.runAsync(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('playlists_updated_at', ?)",
    String(Date.now()),
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('nas_settings', ?)",
    JSON.stringify(target),
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
    receipt,
    job.nonce,
  );
  return { target, ids, uris };
}
