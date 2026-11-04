import { photoExtension } from "@/lib/health/body-photos/model";
import { ARCHIVE_COLUMNS } from "./schema";
import { validateHealthData, type HealthData } from "@/lib/health/backup/model";
import {
  validateSnapshot,
  MAX_SNAPSHOT_BYTES,
  type Snapshot,
} from "@/lib/integrations/model";
import type { ServiceId } from "@/lib/settings/storage";
export type Row = Record<string, string | number | null>;
export const TABLES: Record<ServiceId, string[]> = {
  music: [
    "artists",
    "albums",
    "tracks",
    "recents",
    "favorites",
    "playlists",
    "playlist_tracks",
  ],
  podcast: ["artists", "albums", "tracks", "recents", "favorites"],
  video: ["tracks"],
  focus: ["prod_projects", "prod_tasks", "prod_reminders"],
  wealth: [
    "wealth_accounts",
    "wealth_assets",
    "wealth_quotes",
    "wealth_tx",
    "wealth_goals",
  ],
  health: [],
};
export type ServiceArchiveData = {
  format: "nlc-service";
  version: 1;
  service: ServiceId;
  createdAt: string;
  tables: Record<string, Row[]>;
  preferences: Record<string, unknown>;
  health: HealthData | null;
  integrations: Snapshot[];
  links: Record<string, string>;
  files: string[];
  roots: { from: string; to: string }[];
};
export function validArchivePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length <= 2048 &&
    path.startsWith("media/") &&
    !/[\\\x00]/.test(path) &&
    path
      .split("/")
      .every(
        (p) =>
          p.length > 0 &&
          p.length <= 240 &&
          p !== "." &&
          p !== ".." &&
          !p.startsWith(".nlc-importing-"),
      )
  );
}
function assert(ok: unknown): asserts ok {
  if (!ok) throw new Error("format");
}
function plain(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every(
      (k) => !["__proto__", "constructor", "prototype"].includes(k),
    )
  );
}
export function validateServiceArchive(
  value: unknown,
  service: ServiceId,
): ServiceArchiveData {
  assert(
    plain(value) &&
      Object.keys(value).sort().join(",") ===
        "createdAt,files,format,health,integrations,links,preferences,roots,service,tables,version",
  );
  const data = value as unknown as ServiceArchiveData;
  assert(
    data.format === "nlc-service" &&
      data.version === 1 &&
      data.service === service,
  );
  assert(
    typeof data.createdAt === "string" &&
      Number.isFinite(Date.parse(data.createdAt)),
  );
  assert(
    plain(data.tables) &&
      Object.keys(data.tables).length === TABLES[service].length &&
      TABLES[service].every((t) => Array.isArray(data.tables[t])),
  );
  for (const [table, rows] of Object.entries(data.tables)) {
    assert(
      TABLES[service].includes(table) &&
        Array.isArray(rows) &&
        rows.length <= 200000,
    );
    const columns = ARCHIVE_COLUMNS[
      table as keyof typeof ARCHIVE_COLUMNS
    ] as Record<string, string>;
    for (const row of rows) {
      assert(
        plain(row) && Object.keys(row).length === Object.keys(columns).length,
      );
      for (const [key, spec] of Object.entries(columns)) {
        const v = row[key];
        assert(
          (v === null && spec.endsWith("?")) ||
            (typeof v === spec.replace("?", "") &&
              (typeof v !== "number" || Number.isFinite(v)) &&
              (typeof v !== "string" || v.length <= 2000000)),
        );
      }
    }
    const seen = new Set<string>();
    for (const row of rows) {
      const key = JSON.stringify(
        table === "playlist_tracks"
          ? [row.playlist_id, row.position]
          : (row.id ?? row.position),
      );
      assert(!seen.has(key));
      seen.add(key);
    }
  }
  const tracks = new Set((data.tables.tracks ?? []).map((r) => r.id));
  if (["music", "podcast", "video"].includes(service)) {
    assert((data.tables.tracks ?? []).every((r) => r.kind === service));
    assert(
      (data.tables.favorites ?? []).every((r) => tracks.has(r.track_id)) &&
        (data.tables.recents ?? []).every((r) => tracks.has(r.track_id)),
    );
    if (service !== "video") {
      const albums = new Set(data.tables.albums.map((r) => r.id));
      const artists = new Set(data.tables.artists.map((r) => r.id));
      assert(
        data.tables.tracks.every(
          (r) =>
            albums.has(r.album_id) &&
            (service === "podcast" || artists.has(r.artist_id)),
        ),
      );
    }
  }
  if (service === "focus") {
    const ids = new Set(data.tables.prod_projects.map((r) => r.id));
    assert(data.tables.prod_tasks.every((r) => ids.has(r.project_id)));
  }
  if (service === "music") {
    const ids = new Set(data.tables.playlists.map((r) => r.id));
    assert(
      data.tables.playlist_tracks.every(
        (r) =>
          ids.has(r.playlist_id) &&
          (r.matched_id === null || tracks.has(r.matched_id)),
      ),
    );
  }
  assert(
    plain(data.links) &&
      Array.isArray(data.files) &&
      data.files.length <= 50000 &&
      new Set(data.files).size === data.files.length &&
      data.files.every(validArchivePath),
  );
  const fileSet = new Set(data.files);
  assert(
    Object.values(data.links).every(
      (path) => typeof path === "string" && fileSet.has(path),
    ),
  );
  assert(
    Array.isArray(data.roots) &&
      data.roots.length <= 10 &&
      data.roots.every(
        (r) =>
          plain(r) &&
          typeof r.from === "string" &&
          typeof r.to === "string" &&
          validArchivePath(`media/${r.to}/x`),
      ),
  );
  assert(plain(data.preferences));
  const allowed =
    service === "video"
      ? ["watch", "likes"]
      : service === "music" || service === "podcast"
        ? ["artwork"]
        : service === "health" || service === "wealth"
          ? ["selectedMode"]
          : [];
  assert(Object.keys(data.preferences).every((k) => allowed.includes(k)));
  assert(
    data.preferences.selectedMode === undefined ||
      ["live", "demo"].includes(data.preferences.selectedMode as string),
  );
  if (service === "video") {
    const watchFields =
      "arcPath,arcTitle,durationSec,number,path,positionSec,sagaPath,sagaTitle,seriesId,seriesTitle,title,watchedAt";
    assert(
      Array.isArray(data.preferences.watch) &&
        data.preferences.watch.length <= 1000 &&
        Array.isArray(data.preferences.likes) &&
        data.preferences.likes.length <= 100000,
    );
    for (const value of data.preferences.watch as unknown[]) {
      assert(
        plain(value) && Object.keys(value).sort().join(",") === watchFields,
      );
      for (const [key, v] of Object.entries(value))
        assert(
          ["durationSec", "number", "positionSec", "watchedAt"].includes(key)
            ? typeof v === "number" && Number.isFinite(v) && v >= 0
            : typeof v === "string" && v.length <= 10000,
        );
    }
    for (const value of data.preferences.likes as unknown[])
      assert(
        plain(value) &&
          Object.keys(value).every((k) =>
            ["id", "path", "title", "kind", "file"].includes(k),
          ) &&
          ["id", "path", "title"].every(
            (k) =>
              typeof value[k] === "string" &&
              (value[k] as string).length <= 10000,
          ) &&
          ["series", "movie"].includes(value.kind as string) &&
          (value.file === undefined || typeof value.file === "boolean"),
      );
  }
  if (service === "music" || service === "podcast") {
    assert(plain(data.preferences.artwork));
    for (const [id, item] of Object.entries(data.preferences.artwork))
      assert(
        tracks.has(id) &&
          plain(item) &&
          Object.keys(item).every(
            (k) => k === "artworkUrl" || k === "durationMs",
          ) &&
          (item.artworkUrl === undefined ||
            typeof item.artworkUrl === "string") &&
          (item.durationMs === undefined ||
            (typeof item.durationMs === "number" &&
              Number.isFinite(item.durationMs) &&
              item.durationMs >= 0)),
      );
  }
  if (service === "wealth") {
    const accounts = new Set(data.tables.wealth_accounts.map((r) => r.id));
    const assets = new Set(data.tables.wealth_assets.map((r) => r.id));
    const reference = (value: unknown, ids: Set<string | number | null>) =>
      value === null || ids.has(value as string);
    assert(
      data.tables.wealth_assets.every((r) =>
        reference(r.account_id, accounts),
      ) &&
        data.tables.wealth_quotes.every((r) => assets.has(r.asset_id)) &&
        data.tables.wealth_tx.every(
          (r) =>
            reference(r.account_id, accounts) &&
            reference(r.counter_account_id, accounts) &&
            reference(r.asset_id, assets),
        ) &&
        data.tables.wealth_goals.every(
          (r) =>
            reference(r.account_id, accounts) && reference(r.asset_id, assets),
        ),
    );
  }
  if (service === "focus") {
    assert(
      data.tables.prod_tasks.every(
        (r) =>
          ["todo", "doing", "done"].includes(r.status as string) &&
          [0, 1].includes(r.starred as number),
      ),
    );
    assert(
      data.tables.prod_projects.every((r) =>
        [0, 1].includes(r.archived as number),
      ),
    );
    assert(
      data.tables.prod_reminders.every(
        (r) =>
          Number.isInteger(r.hour) &&
          Number(r.hour) >= 0 &&
          Number(r.hour) <= 23 &&
          Number.isInteger(r.minute) &&
          Number(r.minute) >= 0 &&
          Number(r.minute) <= 59 &&
          [0, 1].includes(r.enabled as number),
      ),
    );
  }
  assert(Array.isArray(data.integrations) && data.integrations.length <= 2);
  const provider =
    service === "wealth" ? "mercury" : service === "health" ? "whoop" : null;
  const modes = new Set<string>();
  for (const copy of data.integrations) {
    validateSnapshot(copy);
    const raw = JSON.stringify(copy);
    assert(
      raw.length <= MAX_SNAPSHOT_BYTES &&
        new TextEncoder().encode(raw).byteLength <= MAX_SNAPSHOT_BYTES,
    );
    assert(copy.provider === provider && !modes.has(copy.mode));
    modes.add(copy.mode);
  }
  if (service === "health") {
    validateHealthData(data.health);
    for (const review of data.health!.bodyReviews)
      for (const photo of Object.values(review.photos))
        assert(
          data.links[`photo:${photo.id}`] ===
            `media/photos/${photo.id}.${photoExtension(photo.mime)}`,
        );
  } else assert(data.health === null);
  // Archives contain files, never reusable access grants. Every backed-up track must have a file.
  assert(
    (data.tables.tracks ?? []).every(
      (row) => typeof row.id === "string" && !!data.links[`track:${row.id}`],
    ),
  );
  return data;
}
export function archiveSummary(data: ServiceArchiveData) {
  return {
    files: data.files.length,
    records:
      Object.values(data.tables).reduce((n, rows) => n + rows.length, 0) +
      (data.health
        ? data.health.weights.length +
          data.health.sessions.length +
          data.health.medication.plans.length +
          data.health.medication.logs.length +
          data.health.nutrition.length +
          data.health.bodyReviews.length
        : 0) +
      data.integrations.reduce(
        (n, copy) =>
          n +
          (copy.provider === "mercury"
            ? copy.transactions.length
            : copy.days.length),
        0,
      ),
  };
}
