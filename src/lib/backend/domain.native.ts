import { knownTrack, rememberSourceResult, validateArtworkInput } from "./known-media.native";
import "@/lib/db/catalog";
import "@/lib/productivity/store";
import "@/lib/reminders/store";
import "@/lib/wealth/store";
import "@/lib/spotify/playlist-store";
import "@/lib/video/favorites";
import "@/lib/video/watch-history";
import "@/lib/health/weight/storage";
import "@/lib/health/training/storage";
import "@/lib/health/medication/storage";
import "@/lib/health/nutrition/storage";
import "@/lib/health/body-photos/storage";
import "@/lib/settings/storage";
import { operations, expose } from "./registry";
import { BackendError } from "./protocol";
import * as settings from "@/lib/settings/storage.impl";
import { createMusicSource, pingNasConnection } from "@/lib/nas/source-factory.impl";
import { webNative } from "./native-module";
let sourceCache: {signature:string;instance:ReturnType<typeof createMusicSource>} | null = null;
async function source() { const saved=await settings.loadNasSettings(), password=await settings.loadNasPassword(),signature=JSON.stringify([saved,password]); if(!sourceCache || sourceCache.signature!==signature)sourceCache={signature,instance:createMusicSource(saved,password)};return sourceCache.instance; }
for (const [name, method] of Object.entries({ ping: "ping", artists: "getArtists", albums: "getAlbums", album: "getAlbum", tracks: "getTracks", search: "search", refresh: "refresh", deleteTrack: "deleteTrack", coverSidecar: "ensureCoverSidecar" } as const)) {
  expose(`source.${name}`, async (...args: any[]) => {
    const instance = await source(); const fn = instance[method]; if (!fn) throw new BackendError(400, "source_unsupported");
    if (name === "deleteTrack" && args[1] !== true) throw new BackendError(400,"confirmation_required");
    if (["deleteTrack", "coverSidecar"].includes(name)) await knownTrack(args[0]);
    const result = await (fn as Function).apply(instance, args);
    if (name === "deleteTrack") { await catalog.removeFavorite(args[0]);await catalog.removeRecent(args[0]);await mediaSession.control("remove",args[0]); }
    if (["artists", "albums", "album", "tracks", "search"].includes(name)) await rememberSourceResult(result);
    return result;
  }, { domain: "catalog", write: ["refresh", "deleteTrack", "coverSidecar"].includes(name), atomic: false, key: args => ["deleteTrack", "coverSidecar"].includes(name) ? args[0] : "$collection" });
}
expose("source.pingConnection", async (next: settings.NasSettings, password: string) => pingNasConnection(next, password || await settings.loadNasPassword()), { domain: "settings", atomic: false });
operations.get("settings.onboarded")!.implementation = async () => true;
operations.get("settings.passwordState")!.implementation = async () => "";
operations.get("settings.password")!.implementation = async (password: string) => { if (password.trim()) await settings.saveNasPassword(password); };
operations.get("settings.save")!.implementation = async (next: settings.NasSettings) => {
  const previous = await settings.loadNasSettings();
  for (const key of Object.keys({ ...previous, ...next }) as (keyof settings.NasSettings)[]) {
    if (/LocalFolder|^localFolder|^localRoot|^serviceSources$/.test(key) && JSON.stringify(previous[key]) !== JSON.stringify(next[key])) throw new BackendError(403, "Se configura en el móvil");
  }
  if (next.sourceKind === "local" && previous.sourceKind !== "local") throw new BackendError(403, "Se configura en el móvil");
  await settings.saveNasSettings(next);
};
// Browser uploads are opaque transfer IDs. Never accept a path supplied in JSON.
const setPhoto = operations.get("body.setPhoto")!; const setPhotoLocal = setPhoto.implementation;
setPhoto.implementation = async (id: string, pose: string, input: any) => {
  if (!input) return setPhotoLocal(id, pose, input);
  if (typeof input.source !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.source)) throw new BackendError(400, "invalid_transfer");
  const upload = await webNative().webTransferInfo(input.source); const state = JSON.parse(upload.state);
  if (state.status !== "uploaded" || state.bytes !== input.bytes) throw new BackendError(400, "incomplete_transfer");
  const actual = await webNative().inspectWebPhoto(input.source);
  if (["width", "height", "mime", "bytes"].some(key => actual[key as keyof typeof actual] !== input[key])) throw new BackendError(400, "invalid_photo");
  return setPhotoLocal(id, pose, { ...input, source: upload.uri });
};

import { servicePreferences } from "@/lib/service-backup/preferences";
import { rawIntegrationStorage as integrationStorage } from "@/lib/integrations/storage";
import { validateSnapshot } from "@/lib/integrations/model";
import { bridgeRequest } from "@/lib/integrations/client";
const preferenceKeys = new Set(["nlc.video.watch.v2", "nlc.video.watch.v1", "nlc.video.likes.v1", "nlc.track-meta.v2", "nlc.integrations.selection.v1"]);
for (const [name, fn] of Object.entries({ get: servicePreferences.getItem, set: servicePreferences.setItem, remove: servicePreferences.removeItem })) expose(`preferences.${name}`, async (key: string, value?: string) => {
 if (!preferenceKeys.has(key)) throw new BackendError(403, "unknown_preference");
 if (name === "set") { if (typeof value !== "string" || value.length > 1048576) throw new BackendError(400, "invalid_preference"); JSON.parse(value); if (key === "nlc.track-meta.v2") await validateArtworkInput(JSON.parse(value)); }
 return (fn as Function)(key, value);
}, { domain: "preferences", write: name !== "get", key: args => args[0] });
for (const [name, fn] of Object.entries({ get: integrationStorage.getItem, set: integrationStorage.setItem, remove: integrationStorage.removeItem })) expose(`integrations.cache.${name}`, async (key: string, value?: string) => {
 if (!/^nlc\.integrations\.v1\.(whoop|mercury)\.(live|demo)$/.test(key)) throw new BackendError(403, "unknown_cache");
 if (name === "set") validateSnapshot(JSON.parse(value!));
 return (fn as Function)(key, value);
}, { domain: "integrations", write: name !== "get", key: args => args[0] });
expose("integrations.bridge", async (path: string, post: boolean) => {
 if (!/^\/(status|(whoop|mercury)\/(snapshot|sync|example))$/.test(path)) throw new BackendError(403, "Se configura en el móvil");
 return bridgeRequest(path, post);
}, { domain: "integrations", atomic: false });

import { mercuryController, loadMercuryController } from "@/lib/integrations/mercury-controller.native";
expose("mercury.state", async () => { await loadMercuryController(); return mercuryController.getSnapshot(); }, { domain: "mercury", atomic: false });
for (const method of ["configure", "disconnect", "rejectPending", "retryStorage"] as const) expose(`mercury.${method}`, async (...args: any[]) => { await loadMercuryController(); await (mercuryController[method] as Function)(...args); return mercuryController.getSnapshot(); }, { domain: "mercury", write: true, atomic: false });

import "./video.native";

import { chatController } from "@/lib/cursor/controller.native";
import type { AppZone } from "@/lib/zone/zone-context";
for (const method of ["state", "configure", "test", "clear", "send"] as const) expose(`chat.${method}`, async (clientId: string, ...args: any[]) => {
 if (typeof clientId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(clientId)) throw new BackendError(400, "invalid_client");
 await chatController.load();
 if (method === "configure") await chatController.configure(args[0]);
 if (method === "test") await chatController.test(args[0]);
 if (method === "clear") await chatController.clear();
 if (method === "send") {
  if (!["music", "podcast", "video", "focus", "wealth", "health"].includes(args[1])) throw new BackendError(400, "invalid_zone");
  await chatController.reserve(args[0]); webNative().startWebChat(JSON.stringify({ text: args[0], zone: args[1], clientId }));
 }
 const snapshot = chatController.getSnapshot(); return { ...snapshot, intent: snapshot.intent?.clientId === clientId ? snapshot.intent : undefined };
}, { domain: "chat", write: !["state", "test"].includes(method), atomic: false });

import "./playback.native";

import { setSecret, deleteSecret } from "@/lib/settings/secret-store";
for (const method of ["set", "clear"] as const) expose(`credentials.${method}`, async (key: string, value?: string) => {
 if (!["nlc.nas.password", "nlc.download.token", "nlc.cursor.api-key"].includes(key)) throw new BackendError(403, "Se configura en el móvil");
 if (method === "clear") await deleteSecret(key); else if (value?.trim()) await setSecret(key, value);
}, { domain: "credentials", write: true, atomic: false, key: args => args[0] });

import { pullFocusFromSources, pushFocusToSources } from "@/lib/productivity/sync.impl";
import { pullWealthFromSources, pushWealthToSources } from "@/lib/wealth/sync.impl";
import { pullPlaylistsFromSources, pushPlaylistsToSources } from "@/lib/spotify/playlist-sync.impl";
for (const [namespace, domain, pull, push] of [["focus", "tasks", pullFocusFromSources, pushFocusToSources], ["wealth", "wealth", pullWealthFromSources, pushWealthToSources], ["playlists", "playlists", pullPlaylistsFromSources, pushPlaylistsToSources]] as const) {
 for (const [direction, fn] of [["pull", pull], ["push", push]] as const) expose(`sync.${namespace}.${direction}`, async () => fn(await settings.loadNasSettings(), await settings.loadNasPassword()), { domain, write: direction === "pull", atomic: false });
}

import "@/lib/spotify/public-playlist";

import "@/lib/youtube/public-playlist";

import "@/lib/library/fetch-track-cover";

import "@/lib/podcasts/download-settings";
import * as downloadSettings from "@/lib/podcasts/download-settings.impl";
import "@/lib/podcasts/downloader";
import * as download from "@/lib/podcasts/downloader.impl";
operations.get("downloader.tokenState")!.implementation = async () => "";
operations.get("downloader.token")!.implementation = async (token: string) => { if (token.trim()) await downloadSettings.saveDownloadToken(token); };
for (const method of ["enqueueDownload", "enqueueAudioReplace", "enqueueSearchDownload", "enqueueSearchDownloads", "getDownloadJob", "listDownloadJobs"] as const) operations.get(`downloader.${method}`)!.implementation = async (_settings: unknown, _token: unknown, ...args: any[]) => (download[method] as Function)(await downloadSettings.loadDownloadSettings(), await downloadSettings.loadDownloadToken(), ...args);

import * as FileSystem from "expo-file-system/legacy";
import { parseMacroFactor, MAX_CSV_BYTES } from "@/lib/health/nutrition/macrofactor";
expose("nutrition.csvPreview", async (id: string) => {
 const upload = await webNative().webTransferInfo(id); const state = JSON.parse(upload.state);
 if (state.status !== "uploaded" || state.bytes > MAX_CSV_BYTES || !/\.csv$/i.test(state.name)) throw new BackendError(400, "invalid_csv");
 const text = await FileSystem.readAsStringAsync(upload.uri); const days = parseMacroFactor(text);
 await webNative().updateWebTransfer(id, JSON.stringify({ status: "complete", result: { validated: true } }));

 return { name: state.name, text: "", days };
}, { domain: "nutrition", atomic: false });

import { ensureReminderPermission } from "@/lib/reminders/notifications";
import { upcomingMedicationAlerts } from "@/lib/health/medication/model";
import { medicationStore } from "@/lib/health/medication/storage.impl";
expose("notifications.permission", () => ensureReminderPermission(false), { domain: "notifications", atomic: false });
expose("notifications.medication", async () => { const data = await medicationStore.read(); const permission = await ensureReminderPermission(false); const alerts = permission && data.alertsEnabled ? upcomingMedicationAlerts(data) : []; return { permission, count: alerts.length, through: alerts.at(-1)?.date ?? null }; }, { domain: "notifications", atomic: false });

import "./offline.native";

import { nutritionStore } from "@/lib/health/nutrition/storage.impl";
expose("nutrition.importCsv", async (id: string, replace: boolean) => {
 const upload = await webNative().webTransferInfo(id); const state = JSON.parse(upload.state);
 if (state.status !== "complete" || !state.result?.validated || state.bytes > MAX_CSV_BYTES || !/\.csv$/i.test(state.name)) throw new BackendError(400, "invalid_csv");
 return nutritionStore.importDays(parseMacroFactor(await FileSystem.readAsStringAsync(upload.uri)), replace === true);
}, { domain: "nutrition", write: true });

import { listWebDavDir } from "@/lib/nas/webdav-source";
expose("nas.list", async (candidate: settings.NasSettings, password: string, path: string) => {
 if (typeof path !== "string" || path.length > 4096 || !path.startsWith("/") || path.includes("\\") || path.split("/").some(part => part === ".." || part === ".")) throw new BackendError(400, "invalid_nas_folder");
 const saved = await settings.loadNasSettings();
 const connection = { ...saved, host: candidate.host, port: candidate.port, username: candidate.username, useHttps: candidate.useHttps, sharePath: candidate.sharePath };
 return listWebDavDir(connection, password || await settings.loadNasPassword(), path);
}, { domain: "settings", atomic: false });

// Ignore caller-supplied track snapshots: only a catalogue result generated by the phone is authoritative.
for (const name of ["pushRecent", "toggleFavorite"] as const) {
 const operation = operations.get(`catalog.${name}`)!, local = operation.implementation;
 operation.implementation = async (input: {id:string}) => local(await knownTrack(input?.id));
}
for (const [name, operation] of operations) if (name.startsWith("playlists.") && operation.options.write) {
 const local = operation.implementation;
 operation.implementation = async (...args:any[]) => {
  await validateArtworkInput(args);
  async function canonical(value:any):Promise<any> { if(Array.isArray(value)) return Promise.all(value.map(canonical)); if(!value || typeof value!=="object")return value; const next={...value}; if(next.matched)next.matched=await knownTrack(next.matched.id); for(const key of ["tracks"])if(Array.isArray(next[key]))next[key]=await canonical(next[key]); return next; }
  if(name === "playlists.addTracksToImportedPlaylist")args[1]=await Promise.all(args[1].map((track:any)=>knownTrack(track.id)));
  else args=await canonical(args);
  return local(...args);
 };
}

operations.get("downloader.checkDownloaderHealth")!.implementation = async (candidate: downloadSettings.DownloadSettings, token: string) => download.checkDownloaderHealth(candidate, token || await downloadSettings.loadDownloadToken());

import "@/lib/library/track-file-edit";
import * as trackFiles from "@/lib/library/track-file-edit.impl";
for (const [name, fn] of [["renameFile",trackFiles.renameTrackFile],["coverUrl",trackFiles.applyTrackCoverUrl]] as const) operations.get(`track.${name}`)!.implementation = async (_settings:unknown,_password:unknown,id:string,value:string) => {
 await knownTrack(id); const saved = await settings.loadNasSettings(); if(saved.sourceKind!=="webdav" || !id.startsWith("/"))throw new BackendError(400,"source_not_file");
 return fn(saved, await settings.loadNasPassword(), id, value);
};

expose("artwork.import", async (id:string) => {
 const upload = await webNative().webTransferInfo(id), job = JSON.parse(upload.state);
 if(job.status!=="uploaded" || job.bytes>8_000_000)throw new BackendError(400,"invalid_photo");
 const actual = await webNative().inspectWebPhoto(id); if(!actual.width || !actual.height)throw new BackendError(400,"invalid_photo");
 const uri = `${FileSystem.documentDirectory}artwork/${id}.${actual.mime==="image/png"?"png":actual.mime==="image/webp"?"webp":"jpg"}`;
 await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}artwork/`,{intermediates:true});
 await FileSystem.copyAsync({from:upload.uri,to:uri});
 await (await getDb()).runAsync("INSERT OR IGNORE INTO backend_resources(kind,id,directory) VALUES ('artwork',?,0)",uri);
 await webNative().updateWebTransfer(id,JSON.stringify({status:"complete"})); return uri;
},{domain:"artwork",write:true,atomic:false});
import { getDb } from "@/lib/db/client";

expose("credentials.state",async()=>({nas:!!await settings.loadNasPassword(),downloader:!!await downloadSettings.loadDownloadToken()}),{domain:"credentials"});

import * as catalog from "@/lib/db/catalog.impl";
import {mediaSession} from "@/lib/player/session.native";

import "./track-jobs.native";

import { startMercuryTask } from "@/lib/integrations/mercury-controller.native";
for (const method of ["sync", "acceptPending"] as const) expose(`mercury.${method}`, () => startMercuryTask(method), {domain:"mercury",atomic:false});
