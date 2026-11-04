import { makeTrainingAnalyticsDemo } from "./training-analytics-fixture";
import { seedNutritionDemo } from "./nutrition-fixture";
import { nutritionStore } from "@/lib/health/nutrition/storage";
import { bodyStore } from "@/lib/health/body-photos/storage";
import { seedBodyPhotoDemo } from "./body-photo-fixture";
import { makeMedicationDemoFixture } from "./medication-fixture";
import { medicationStore } from "@/lib/health/medication/storage";
import { trainingStore } from "@/lib/health/training/storage";
import { makeTrainingDemoSessions } from "./training-fixture";
import { getDb } from "@/lib/db/client";
import { getAlbums, getArtists, getTracks, loadPlaylists, replaceFavorites, replaceRecents, savePlaylists } from "@/lib/db/catalog";
import { localDateKey } from "@/lib/health/weight/model";
import { weightStore } from "@/lib/health/weight/storage";
import { createMusicSource } from "@/lib/nas/source-factory";
import { replaceProductivity } from "@/lib/productivity/store";
import { replaceReminders } from "@/lib/reminders/store";
import { DEFAULT_NAS_SETTINGS, saveNasPassword, saveNasSettings, saveOnboardingComplete, type NasSettings } from "@/lib/settings/storage";
import { saveDownloadSettings, saveDownloadToken } from "@/lib/podcasts/download-settings";
import type { ImportedPlaylist } from "@/lib/spotify/types";
import { clearLastWatch, loadWatchHistory, markWatching } from "@/lib/video/watch-history";
import { seriesFromPath } from "@/lib/video/browse";
import { toggleVideoFavorite } from "@/lib/video/favorites";
import { dumpWealth, replaceWealth } from "@/lib/wealth/store";
import { cashTotal, holdingsValue, netWorth } from "@/lib/wealth/compute";
import { makeDemoFixture } from "./demo-fixture";
import { requireLocalDemo } from "./local-demo";

export const DEMO_NAS_SETTINGS: NasSettings = {
  ...DEFAULT_NAS_SETTINGS, sourceKind: "webdav", host: "127.0.0.1", port: "8086", username: "demo",
  sharePath: "/Music", podcastSharePath: "/Music/Podcasts", useHttps: false,
  videoHost: "127.0.0.1", videoPort: "8086", videoUsername: "demo", videoSharePath: "/Video", videoUseHttps: false,
  focusSharePath: "", wealthSharePath: "",
};

export async function demoSummary() {
  requireLocalDemo();
  const db = await getDb();
  const count = async (table: string) => (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;
  const wealth = await dumpWealth();
  return {
    artists: (await getArtists()).length, albums: (await getAlbums()).length,
    tracks: (await getTracks({ kind: "music" })).length, podcasts: (await getTracks({ kind: "podcast" })).length,
    playlists: (await loadPlaylists()).length, projects: await count("prod_projects"), tasks: await count("prod_tasks"),
    reminders: await count("prod_reminders"), accounts: wealth.accounts.length, assets: wealth.assets.length,
    movements: wealth.txs.length, goals: wealth.goals.length, weights: (await weightStore.list()).length,
    trainingSessions: (await trainingStore.list()).length,
    nutritionDays: (await nutritionStore.list()).length,
    bodyReviews: (await bodyStore.list()).length, bodyPhotos: (await bodyStore.list()).reduce((sum, entry) => sum + Object.keys(entry.photos).length, 0),
    medicationPlans: (await medicationStore.read()).plans.length, medicationLogs: (await medicationStore.read()).logs.filter((log) => log.status !== "pending").length,
    cash: cashTotal(wealth.accounts, wealth.txs), invested: holdingsValue(wealth.assets), total: netWorth(wealth.accounts, wealth.assets, wealth.txs),
  };
}

export async function seedLocalDemo() {
  requireLocalDemo();
  const db = await getDb();
  const nutritionLoaded = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", "demo_nutrition_v1");
  if (!nutritionLoaded) {
    await seedNutritionDemo();
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", "demo_nutrition_v1", "1");
  }
  const bodyLoaded = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", "demo_body_photos_v1");
  if (!bodyLoaded) {
    await seedBodyPhotoDemo();
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", "demo_body_photos_v1", "1");
  }
  const medicationLoaded = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", "demo_medication_v1");
  if (!medicationLoaded) {
    const fixture = makeMedicationDemoFixture();
    for (const plan of fixture.plans) await db.runAsync("INSERT OR IGNORE INTO health_medication_plans (id, updated_at, payload) VALUES (?, ?, ?)", plan.id, plan.updatedAt, JSON.stringify(plan));
    for (const log of fixture.logs) await db.runAsync("INSERT OR IGNORE INTO health_medication_logs (id, plan_id, entry_date, payload) VALUES (?, ?, ?, ?)", log.id, log.planId, log.date, JSON.stringify(log));
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", "demo_medication_v1", "1");
  }
  const trainingLoaded = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", "demo_training_v1");
  if (!trainingLoaded) {
    for (const session of makeTrainingDemoSessions(localDateKey())) {
      const existing = (await trainingStore.list()).some((row) => row.id === session.id);
      if (!existing) await trainingStore.save(session);
    }
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", "demo_training_v1", "1");
  }
  const analyticsLoaded = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", "demo_training_analytics_v1");
  if (!analyticsLoaded) {
    const existingIds = new Set((await trainingStore.list()).map((session) => session.id));
    for (const session of makeTrainingAnalyticsDemo(localDateKey())) if (!existingIds.has(session.id)) await trainingStore.save(session);
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", "demo_training_analytics_v1", "1");
  }
  const loaded = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", "demo_seed_v1");
  if (loaded) {
    // Repair the identifier used by the first local fixture without resetting edits.
    const history = await loadWatchHistory();
    const sample = history.find((entry) => entry.path.startsWith("/Video/series/Orbitas/"));
    if (sample && history.some((entry) => entry.path.startsWith("/Video/series/Orbitas/") && entry.seriesId !== seriesFromPath(entry.path).id)) {
      await clearLastWatch("/Video/series/Orbitas");
      await markWatching({ ...sample, seriesId: seriesFromPath(sample.path).id });
    }
    return demoSummary();
  }
  const fixture = makeDemoFixture(localDateKey());
  await saveNasSettings(DEMO_NAS_SETTINGS);
  await saveNasPassword("demo");
  await saveOnboardingComplete();
  await saveDownloadSettings({ host: "127.0.0.1", port: "8086", enabled: true });
  await saveDownloadToken("");
  const source = createMusicSource(DEMO_NAS_SETTINGS, "demo");
  const ping = await source.ping();
  if (!ping.ok) throw new Error(ping.message);
  await source.getAlbums();
  const music = await getTracks({ kind: "music" });
  const podcasts = await getTracks({ kind: "podcast" });
  if (music.length < 8 || podcasts.length < 2) throw new Error("El NAS simulado no ha indexado la biblioteca completa.");
  await replaceRecents([...music.slice(0, 4), ...podcasts.slice(0, 2)]);
  await replaceFavorites([music[0]!, music[3]!, podcasts[0]!]);
  const playlist = (id: string, name: string, indices: number[]): ImportedPlaylist => ({
    id, name, kind: "local", ownerName: "Prueba local", coverUrl: null, spotifyUrl: "", importedAt: Date.now(), liked: true,
    tracks: indices.map((i) => ({ spotifyId: `demo-${i}`, title: music[i]!.title, artistName: music[i]!.artistName,
      albumName: music[i]!.albumName, durationMs: 30000, coverUrl: null, matched: music[i]! })),
  });
  await savePlaylists([playlist("demo-playlist-1", "Para concentrarse", [0, 1, 4, 6]), playlist("demo-playlist-2", "Paseo de tarde", [2, 3, 7])]);
  await replaceProductivity({ projects: fixture.projects, tasks: fixture.tasks });
  await replaceReminders(fixture.reminders);
  await replaceWealth(fixture.wealth);
  for (const entry of fixture.weights) await weightStore.save(entry);
  const seriesPath = "/Video/series/Orbitas";
  await markWatching({ seriesId: seriesFromPath(seriesPath + "/Temporada 1/0001 - Amanecer.mp4").id, seriesTitle: "Orbitas", path: `${seriesPath}/Temporada 1/0001 - Amanecer.mp4`,
    arcPath: `${seriesPath}/Temporada 1`, sagaPath: seriesPath, number: 1, title: "Amanecer", arcTitle: "Temporada 1", sagaTitle: "Orbitas", positionSec: 9, durationSec: 40 });
  await toggleVideoFavorite({ path: seriesPath, title: "Orbitas", kind: "series", id: encodeURIComponent(seriesPath) });
  await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", "demo_seed_v1", new Date().toISOString());
  return demoSummary();
}
