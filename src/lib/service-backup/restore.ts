import { importEpochKey } from "./epochs";
import { preferenceKey, servicePreferences } from "./preferences";
import {
  loadWatchHistory,
  reloadWatchHistory,
} from "@/lib/video/watch-history";
import {
  loadVideoFavorites,
  reloadVideoFavorites,
} from "@/lib/video/favorites";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { openIsolatedHealthDb } from "@/lib/db/sqlite-client";
import { runInTransaction } from "@/lib/db/client";
import { notifyCatalog } from "@/lib/db/catalog";
import { withHealthLock } from "@/lib/health/access";
import { readSqlHealth, writeSqlHealth } from "@/lib/health/backup/sql";
import {
  photoList,
  validateHealthData,
  type HealthData,
} from "@/lib/health/backup/model";
import { photoExtension } from "@/lib/health/body-photos/model";
import { withLocalFolder, withSourceMode } from "@/lib/settings/service-source";
import type { NasSettings, ServiceId } from "@/lib/settings/storage";
import { integrationStorage } from "@/lib/integrations/storage";
import { createIntegrationCache } from "@/lib/integrations/cache";
import {
  TABLES,
  validateServiceArchive,
  type Row,
  type ServiceArchiveData,
} from "./model";
import { commitArchiveFiles, type ArchiveStage } from "./native";
import { mapVideoBackup } from "@/lib/video/backup";
import {
  hydrateTrackArtworkCache,
  reloadTrackArtworkCache,
} from "@/lib/library/artwork-cache";
import { notifyServiceImport } from "./events";
function merge<T>(before: T[], after: T[], id: (row: T) => string): T[] {
  const rows = new Map(before.map((row) => [id(row), row]));
  for (const row of after) rows.set(id(row), row);
  return [...rows.values()];
}
function mergeHealth(before: HealthData, after: HealthData): HealthData {
  return validateHealthData({
    weights: merge(before.weights, after.weights, (r) => r.entryDate),
    sessions: merge(before.sessions, after.sessions, (r) => r.id),
    nutrition: merge(before.nutrition, after.nutrition, (r) => r.date),
    bodyReviews: [
      ...before.bodyReviews.filter(
        (old) =>
          !after.bodyReviews.some(
            (row) => row.id === old.id || row.date === old.date,
          ),
      ),
      ...after.bodyReviews,
    ],
    medication: {
      plans: merge(
        before.medication.plans,
        after.medication.plans,
        (r) => r.id,
      ),
      logs: merge(before.medication.logs, after.medication.logs, (r) => r.id),
      alertsEnabled: before.medication.alertsEnabled,
    },
  });
}
export async function restoreService(
  stage: ArchiveStage,
  service: ServiceId,
  settings: NasSettings,
  destination: string | null,
  job: string,
) {
  const data = validateServiceArchive(JSON.parse(stage.metadata), service);
  if (
    Object.keys(stage.files).length !== data.files.length ||
    data.files.some((path) => !stage.files[path])
  )
    throw new Error("integrity");
  const cache = createIntegrationCache(integrationStorage);
  for (const incoming of data.integrations) {
    const current = await cache.read(incoming.provider, incoming.mode);
    if (incoming.mode === "live" && current && current.owner !== incoming.owner)
      throw new Error("accountChanged");
  }
  if (service === "health")
    for (const photo of photoList(data.health!)) {
      const item = stage.files[data.links[`photo:${photo.id}`]];
      if (!item || item.bytes !== photo.bytes) throw new Error("integrity");
    }
  const db = await openIsolatedHealthDb();
  const created: string[] = [];
  let copiedRoot: string | null = null;
  let committed = false;
  try {
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS integration_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL)",
    );
    let next = settings;
    let mapping: Record<string, string> = {};
    let relativePaths: Record<string, string> = {};
    // Extracted, verified files are copied into a new folder; existing media is never overwritten.
    const media = ["music", "podcast", "video"].includes(service);
    if (media && data.files.length) {
      if (!destination) throw new Error("destination");
      const result = await commitArchiveFiles(stage, destination, job);
      mapping = result.files;
      relativePaths = result.paths ?? {};
      copiedRoot = result.root;
      next = withSourceMode(
        withLocalFolder(settings, service, result.root, result.name),
        service,
        "local",
      );
    }
    if (service === "health") {
      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}health-body-photos/`,
        { intermediates: true },
      );
      for (const photo of photoList(data.health!)) {
        const item = stage.files[data.links[`photo:${photo.id}`]];
        if (!item || item.bytes !== photo.bytes) throw new Error("integrity");
        const id = Crypto.randomUUID();
        const uri = `${FileSystem.documentDirectory}health-body-photos/${id}.${photoExtension(photo.mime)}`;
        created.push(uri);
        await FileSystem.copyAsync({ from: item.uri, to: uri });
        photo.id = id;
      }
      validateHealthData(data.health);
    }
    const remap = new Map<string, string>();
    const origins = new Map(
      (
        await db.getAllAsync<{ origin_id: string; track_id: string }>(
          "SELECT origin_id, track_id FROM service_media_origins WHERE service = ?",
          service,
        )
      ).map((row) => [row.origin_id, row.track_id]),
    );
    const identities: { origin: string; previous: string[]; id: string }[] = [];
    for (const row of data.tables.tracks ?? []) {
      const old = String(row.id);
      const entry = data.links[`track:${old}`];
      const uri = mapping[entry];
      if (!uri) throw new Error("integrity");
      const id =
        service === "video"
          ? `/local-video/${relativePaths[entry] ?? entry.slice("media/".length)}`
          : `${service === "podcast" ? "localpod" : "local"}:${uri}`;
      const previous = [
        ...new Set(
          [old, origins.get(old)].filter(
            (value): value is string => !!value && value !== id,
          ),
        ),
      ];
      identities.push({ origin: old, previous, id });
      remap.set(old, id);
      for (const previousId of previous) remap.set(previousId, id);
      row.id = id;
      row.local_uri = uri;
      row.local_bytes = stage.files[entry].bytes;
      row.offline_status = "ready";
      row.on_nas = 0;
    }
    const cover = (raw: string | number | null) =>
      typeof raw === "string" && data.links[`cover:${raw}`]
        ? (mapping[data.links[`cover:${raw}`]] ?? null)
        : raw;
    for (const rows of Object.values(data.tables))
      for (const row of rows) {
        for (const field of ["track_id", "matched_id"])
          if (typeof row[field] === "string")
            row[field] = remap.get(row[field] as string) ?? row[field];
        for (const field of ["cover_id", "artwork_url", "cover_url"])
          if (field in row) row[field] = cover(row[field]);
      }
    const preferences: Record<string, unknown> = {};
    if (service === "health" || service === "wealth") {
      const selected = data.preferences.selectedMode;
      if (selected === "live" || selected === "demo") {
        const previous = await servicePreferences.getItem(
          "nlc.integrations.selection.v1",
        );
        preferences["nlc.integrations.selection.v1"] = {
          whoop: "live",
          mercury: "live",
          ...(previous ? JSON.parse(previous) : {}),
          [service === "health" ? "whoop" : "mercury"]: selected,
        };
      }
    }
    if (service === "video") {
      const incoming = mapVideoBackup(
        data.preferences,
        data.roots,
        relativePaths,
      );
      const previous = mapVideoBackup(
        { watch: await loadWatchHistory(), likes: await loadVideoFavorites() },
        data.roots,
        relativePaths,
      );
      preferences["nlc.video.watch.v2"] = merge(
        previous.watch,
        incoming.watch,
        (row) => row.seriesId,
      )
        .sort((a, b) => b.watchedAt - a.watchedAt)
        .slice(0, 12);
      preferences["nlc.video.likes.v1"] = merge(
        previous.likes,
        incoming.likes,
        (row) => row.path,
      );
    }
    if (service === "music" || service === "podcast") {
      const previous = await hydrateTrackArtworkCache();
      const incoming = data.preferences.artwork as Record<
        string,
        { artworkUrl?: string; durationMs?: number }
      >;
      preferences["nlc.track-meta.v2"] = {
        ...previous,
        ...Object.fromEntries(
          Object.entries(incoming ?? {}).map(([id, value]) => [
            remap.get(id) ?? id,
            {
              ...value,
              ...(value.artworkUrl
                ? { artworkUrl: cover(value.artworkUrl) }
                : {}),
            },
          ]),
        ),
      };
    }
    try {
      await withHealthLock(async () => {
        const currentHealth =
          service === "health" ? (await readSqlHealth(db)).data : null;
        await runInTransaction(db, async () => {
          for (const identity of identities) {
            for (const previous of identity.previous) {
              for (const table of ["favorites", "recents"])
                await db.runAsync(
                  `UPDATE ${table} SET track_id = ? WHERE track_id = ?`,
                  identity.id,
                  previous,
                );
              await db.runAsync(
                "UPDATE playlist_tracks SET matched_id = ? WHERE matched_id = ?",
                identity.id,
                previous,
              );
              await db.runAsync(
                "DELETE FROM tracks WHERE id = ? AND kind = ?",
                previous,
                service,
              );
              await db.runAsync(
                "UPDATE service_media_origins SET track_id = ? WHERE service = ? AND track_id = ?",
                identity.id,
                service,
                previous,
              );
            }
            await db.runAsync(
              "INSERT OR REPLACE INTO service_media_origins (service, origin_id, track_id) VALUES (?, ?, ?)",
              service,
              identity.origin,
              identity.id,
            );
          }
          if (currentHealth)
            await writeSqlHealth(db, {
              data: mergeHealth(currentHealth, data.health!),
              rest: null,
            });
          for (const table of TABLES[service]) {
            const rows = data.tables[table];
            if (table === "recents" || table === "favorites") {
              const previous = await db.getAllAsync<Row>(
                `SELECT * FROM ${table} ORDER BY position`,
              );
              const ids = [
                ...new Set([
                  ...rows
                    .sort((a, b) => Number(a.position) - Number(b.position))
                    .map((r) => String(r.track_id)),
                  ...previous.map((r) => String(r.track_id)),
                ]),
              ];
              await db.runAsync(`DELETE FROM ${table}`);
              for (const [index, id] of ids.entries())
                await db.runAsync(
                  `INSERT INTO ${table} (position, track_id) VALUES (?, ?)`,
                  index,
                  id,
                );
              continue;
            }
            if (table === "playlists")
              for (const row of rows)
                await db.runAsync(
                  "DELETE FROM playlist_tracks WHERE playlist_id = ?",
                  row.id,
                );
            for (const row of rows) {
              const fields = Object.keys(row);
              await db.runAsync(
                `INSERT OR REPLACE INTO ${table} (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`,
                ...fields.map((key) => row[key]),
              );
            }
          }
          for (const copy of data.integrations)
            await db.runAsync(
              "INSERT OR REPLACE INTO integration_cache (key, payload) VALUES (?, ?)",
              `nlc.integrations.v1.${copy.provider}.${copy.mode}`,
              JSON.stringify(copy),
            );
          if (service === "music")
            await db.runAsync(
              "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
              "playlists_updated_at",
              String(Date.now()),
            );
          if (service === "focus" || service === "wealth")
            await db.runAsync(
              "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
              importEpochKey(service),
              String(Date.now()),
            );
          for (const [key, value] of Object.entries(preferences))
            await db.runAsync(
              "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
              preferenceKey(key),
              JSON.stringify(value),
            );
          if (next !== settings)
            await db.runAsync(
              "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
              "nas_settings",
              JSON.stringify(next),
            );
        });
      });
    } catch (error) {
      for (const uri of created)
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      throw error;
    }
    committed = true;
    // Presentation cache reloads are optional: the committed SQLite values are already durable.
    if (service === "video")
      await Promise.all([reloadWatchHistory(), reloadVideoFavorites()]).catch(
        () => {},
      );
    if (service === "music" || service === "podcast")
      await reloadTrackArtworkCache().catch(() => {});
    if (media) notifyCatalog();
    notifyServiceImport(service, next);
    return next;
  } finally {
    if (!committed) {
      for (const uri of created)
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      if (copiedRoot)
        await FileSystem.deleteAsync(copiedRoot, { idempotent: true }).catch(
          () => {},
        );
    }
    await db.closeAsync?.().catch(() => {});
  }
}
