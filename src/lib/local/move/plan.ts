import { getDb } from "@/lib/db/client";
import { servicePreferences } from "@/lib/service-backup/preferences";
import {
  SERVICES,
  localFolder,
  sourceMode,
} from "@/lib/settings/service-source";
import type { NasSettings, ServiceId } from "@/lib/settings/storage.impl";
import type { MoveMetadata } from "./native";
export function moveFingerprint(settings: NasSettings) {
  return JSON.stringify([
    settings.sourceKind,
    ...SERVICES.map((id) => [
      id,
      sourceMode(settings, id),
      localFolder(settings, id).uri,
    ]),
  ]);
}
const isLocal = (uri: unknown): uri is string =>
  typeof uri === "string" && /^(file|content):/.test(uri);
const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
const clean = (text: unknown) =>
  String(text || "Unknown")
    .replace(/[\\/\u0000-\u001f]/g, "_")
    .slice(0, 120)
    .replace(/^\.+$/, "_");
export async function buildMovePlan(
  settings: NasSettings,
  target: NasSettings,
) {
  const db = await getDb();
  const extras: {
    service: ServiceId;
    ref: string;
    uri?: string;
    path?: string;
    relative?: string;
  }[] = [];
  const tracks = await db.getAllAsync<{
    id: string;
    kind: ServiceId;
    local_uri: string | null;
    title: string;
    artist_name: string;
    album_name: string;
  }>(
    "SELECT * FROM tracks WHERE offline_status = 'ready' OR id LIKE 'local:%' OR id LIKE 'localpod:%' OR id LIKE '/local-video/%'",
  );
  for (const row of tracks) {
    if (!["music", "podcast", "video"].includes(row.kind)) continue;
    const uri =
      row.local_uri ||
      (row.id.startsWith("localpod:")
        ? row.id.slice(9)
        : row.id.startsWith("local:")
          ? row.id.slice(6)
          : null);
    if (isLocal(uri)) {
      const decoded = decode(uri),
        ext =
          /\.([a-z0-9]{1,6})(?:[?#]|$)/i.exec(decoded)?.[1] ??
          (row.kind === "video" ? "mp4" : "mp3");
      extras.push({
        service: row.kind,
        ref: `track:${row.id}`,
        uri,
        path:
          row.kind === "video"
            ? `offline/${clean(row.title)}.${ext}`
            : `${clean(row.artist_name)}/${clean(row.album_name)}/${clean(row.title)}.${ext}`,
      });
    } else if (
      row.id.startsWith("/local-video/") &&
      localFolder(settings, "video").uri
    )
      extras.push({
        service: "video",
        ref: `track:${row.id}`,
        relative: row.id.slice(13),
      });
  }
  const covers = await db.getAllAsync<{ uri: string; service: ServiceId }>(
    `SELECT cover_id AS uri, CASE WHEN kind = 'podcast' THEN 'podcast' ELSE 'music' END AS service FROM albums UNION SELECT cover_id AS uri, 'music' AS service FROM artists UNION SELECT cover_id AS uri, kind AS service FROM tracks UNION SELECT artwork_url AS uri, kind AS service FROM tracks UNION SELECT cover_url AS uri, CASE WHEN kind = 'podcast' THEN 'podcast' ELSE 'music' END AS service FROM playlists UNION SELECT cover_url AS uri, 'music' AS service FROM playlist_tracks`,
  );
  const artwork = JSON.parse(
    (await servicePreferences.getItem("nlc.track-meta.v2")) || "{}",
  );
  for (const value of Object.values(artwork) as { artworkUrl?: string }[])
    if (value.artworkUrl)
      covers.push({ uri: value.artworkUrl, service: "music" });
  const seen = new Set<string>();
  for (const cover of covers)
    if (isLocal(cover.uri) && !seen.has(cover.uri)) {
      seen.add(cover.uri);
      extras.push({
        service: ["music", "podcast", "video"].includes(cover.service)
          ? cover.service
          : "music",
        ref: `cover:${cover.uri}`,
        uri: cover.uri,
        path: `artwork/${clean(decode(cover.uri).split("/").pop())}`,
      });
    }
  const metadata: MoveMetadata = {
    fingerprint: moveFingerprint(settings),
    source: settings,
    target,
  };
  return {
    metadata,
    general: target.localRootFolderUri,
    targets: Object.fromEntries(
      SERVICES.map((id) => [id, localFolder(target, id)]),
    ),
    sources: SERVICES.flatMap((service) => {
      const { uri } = localFolder(settings, service);
      return uri ? [{ service, uri }] : [];
    }),
    extras,
  };
}
