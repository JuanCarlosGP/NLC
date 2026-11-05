import { dumpPlaylists } from "@/lib/spotify/playlist-sync";
import { emitPlaylistStoreChanged } from "@/lib/spotify/playlist-store";
import * as Crypto from "expo-crypto";
import { getDb, runInTransaction } from "@/lib/db/client";
import { openIsolatedHealthDb } from "@/lib/db/sqlite-client";
import { notifyCatalog } from "@/lib/db/catalog";
import { servicePreferences } from "@/lib/service-backup/preferences";
import { notifyServiceImport } from "@/lib/service-backup/events";
import {
  reloadTrackArtworkCache,
  hydrateTrackArtworkCache,
} from "@/lib/library/artwork-cache";
import {
  flushWatchProgress,
  reloadWatchHistory,
  loadWatchHistory,
} from "@/lib/video/watch-history";
import {
  loadVideoFavorites,
  reloadVideoFavorites,
} from "@/lib/video/favorites";
import { forgetLocalVideoTree } from "@/lib/local/local-video";
import { dumpFocus } from "@/lib/productivity/sync";
import { dumpWealth } from "@/lib/wealth/store";
import {
  pauseOfflineSync,
  getOfflineProgress,
  subscribeOfflineProgress,
} from "@/lib/offline/downloader";
import {
  MOVE_ACTIVE,
  notifyLocalMoveLock,
  drainLocalSourceSync,
} from "../move-lock";
import { buildMovePlan } from "./plan";
import { applyMove, MOVE_PREFS } from "./apply";
import {
  moveNative,
  pendingMoves,
  readMoveFiles,
  withMoveJson,
  type MoveSummary,
} from "./native";
import type { NasSettings } from "@/lib/settings/storage";
const remaps = new Set<
  (ids: Map<string, string>, uris: Map<string, string>) => void
>();
export const onLocalMoveRemap = (
  fn: (ids: Map<string, string>, uris: Map<string, string>) => void,
) => {
  remaps.add(fn);
  return () => {
    remaps.delete(fn);
  };
};
async function clearLock(id: string) {
  await (
    await getDb()
  ).runAsync("DELETE FROM meta WHERE key = ? AND value = ?", MOVE_ACTIVE, id);
  notifyLocalMoveLock(false);
  forgetLocalVideoTree();
  notifyCatalog();
}
export async function recoverMoves() {
  const jobs = await pendingMoves(),
    db = await getDb();
  const lock = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    MOVE_ACTIVE,
  );
  if (lock && !jobs.some((j) => j.id === lock.value))
    await clearLock(lock.value);
  // A committed receipt lets native remove copy markers on startup.
  forgetLocalVideoTree();
  return jobs;
}
export async function prepareMove(
  source: NasSettings,
  target: NasSettings,
  id = Crypto.randomUUID(),
  cancelled: () => boolean = () => false,
) {
  moveNative();
  const db = await getDb();
  await runInTransaction(db, async () => {
    const lock = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = ?",
      MOVE_ACTIVE,
    );
    if (lock && lock.value !== id) throw new Error("busy");
    await db.runAsync(
      "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
      MOVE_ACTIVE,
      id,
    );
  });
  notifyLocalMoveLock(true);
  await drainLocalSourceSync();
  pauseOfflineSync();
  // Let an already streaming download finish before the file inventory is taken.
  if (getOfflineProgress().running)
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        unsubscribe();
        clearInterval(timer);
        if (cancelled()) reject(new Error("cancelled"));
        else resolve();
      };
      const unsubscribe = subscribeOfflineProgress(() => {
        if (!getOfflineProgress().running) finish();
      });
      const timer = setInterval(() => {
        if (cancelled() || !getOfflineProgress().running) finish();
      }, 250);
    });
  if (cancelled()) throw new Error("cancelled");
  await Promise.all([
    loadWatchHistory(),
    loadVideoFavorites(),
    hydrateTrackArtworkCache(),
  ]);
  await flushWatchProgress();
  return withMoveJson(id, await buildMovePlan(source, target), async (uri) => {
    if (cancelled()) throw new Error("cancelled");
    return JSON.parse(
      await moveNative().prepareLocalMove(id, uri),
    ) as MoveSummary;
  });
}
export async function commitMove(
  job: MoveSummary,
  cancelled: () => boolean,
  onCommitted: (settings: NasSettings) => void,
) {
  const mod = moveNative(),
    uri = await mod.copyLocalMove(job.id);
  const files = await readMoveFiles(uri);
  await mod.verifyLocalMove(job.id);
  const fallback = Object.fromEntries(
    await Promise.all(
      MOVE_PREFS.map(async (key) => [
        key,
        await servicePreferences.getItem(key),
      ]),
    ),
  );
  if (cancelled()) throw new Error("cancelled");
  const db = await openIsolatedHealthDb();
  let applied!: Awaited<ReturnType<typeof applyMove>>;
  try {
    await runInTransaction(db, async () => {
      if (cancelled()) throw new Error("cancelled");
      applied = await applyMove(db, job, files, fallback);
    });
  } finally {
    await db.closeAsync?.();
  }
  onCommitted(applied.target);
  for (const fn of remaps) fn(applied.ids, applied.uris);
  await Promise.all([
    reloadTrackArtworkCache(),
    reloadWatchHistory(),
    reloadVideoFavorites(),
  ]);
  return finishMove({ ...job, state: "committed" }, cancelled);
}
export async function finishMove(
  job: MoveSummary,
  cancelled: () => boolean = () => false,
): Promise<MoveSummary> {
  if (cancelled()) throw new Error("cancelled");
  // Also runs after a crash between the SQL commit and the first UI refresh.
  const files = await readMoveFiles(await moveNative().copyLocalMove(job.id));
  const ids = new Map<string, string>(),
    uris = new Map<string, string>();
  for (const file of files) {
    if (!uris.has(file.source)) uris.set(file.source, file.uri);
    for (const ref of file.refs) {
      if (ref.startsWith("uri:") && !uris.has(ref.slice(4)))
        uris.set(ref.slice(4), file.uri);
      if (ref.startsWith("track:"))
        ids.set(
          ref.slice(6),
          file.service === "video"
            ? `/local-video/${file.path}`
            : `${file.service === "podcast" ? "localpod" : "local"}:${file.uri}`,
        );
    }
  }
  for (const fn of remaps) fn(ids, uris);
  await Promise.all([
    reloadTrackArtworkCache(),
    reloadWatchHistory(),
    reloadVideoFavorites(),
  ]);
  if (cancelled()) throw new Error("cancelled");
  const [focus, wealth, music] = await Promise.all([
    dumpFocus(),
    dumpWealth(),
    dumpPlaylists(),
  ]);
  const stamp = Date.now();
  const result = await withMoveJson(
    `${job.id}-mirrors`,
    {
      music: JSON.stringify({ ...music, updatedAt: stamp }),
      focus: JSON.stringify({ ...focus, updatedAt: stamp }),
      wealth: JSON.stringify({ ...wealth, updatedAt: stamp }),
    },
    async (uri) => {
      if (cancelled()) throw new Error("cancelled");
      return JSON.parse(
        await moveNative().finishLocalMove(job.id, uri),
      ) as MoveSummary;
    },
  );
  if (result.state === "done") {
    await clearLock(job.id);
    emitPlaylistStoreChanged();
    for (const service of ["podcast", "video"] as const)
      notifyServiceImport(service, job.metadata.target);
  }
  return result;
}
export async function abortMove(id: string) {
  const result = JSON.parse(await moveNative().abortLocalMove(id)) as {
    kept: number;
  };
  await clearLock(id);
  return result;
}
export async function keepMoveOriginals(job: MoveSummary) {
  await moveNative().keepLocalMoveOriginals(job.id);
  await clearLock(job.id);
  emitPlaylistStoreChanged();
  for (const service of ["podcast", "video"] as const)
    notifyServiceImport(service, job.metadata.target);
}
