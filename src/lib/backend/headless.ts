import { recoverArchiveCommits } from "./import-recovery.native";
import { handleLegacyTask } from "./legacy.native";
import { setRuntimeLocale } from "@/lib/i18n/runtime";
import { chatController } from "@/lib/cursor/controller.native";
import "./domain.native";
import "./effects.native";
import { runWebJob } from "./jobs.native";
import "@/lib/health/backup/service";
import { serialize } from "./write-queue";
import { executeCommand } from "./native";
import { webNative } from "./native-module";
import { BackendError } from "./protocol";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseNativeAppearance } from "@/lib/appearance/native-store";
import { APPEARANCE_KEY } from "@/lib/appearance/themes";
import { loadLocale } from "@/lib/i18n/storage";
import { resolveMedia } from "./media.native";
import pkg from "../../../package.json";
export async function handleWebTask(request: { requestId: string; method: string; path: string; body: string }) {
 try {await recoverArchiveCommits();} catch {webNative().resolveWebRequest(request.requestId,JSON.stringify({status:503,body:JSON.stringify({error:"import_recovery_required"})}));return;}
 if (request.method === "BRIDGE") { await handleLegacyTask(request.body); return; }
 if (request.method === "CHAT") {
  const job = JSON.parse(request.body);
  setRuntimeLocale(await loadLocale());
  await chatController.runReserved(job.text, job.zone, job.clientId, job.provider);
  return;
 }
 if (request.method === "JOB") { await runWebJob(request.requestId, request.path); return; }
 const native = webNative();
 const body = request.body || native.readWebRequestBody?.(request.requestId) || "";
 try {
  setRuntimeLocale(await loadLocale());
  const host = native.webInterfaceState();
  let data: unknown;
  if (request.path === "/api/v1/bootstrap") {
   data = { protocol: 1, version: pkg.version, bundleId: host.bundleId, clock: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    presentation: Object.fromEntries((await AsyncStorage.multiGet(["nlc.app.zone.v1", "nlc.app.zones.enabled.v1", "nlc.home.browse.v1", "nlc.library.browse.v1", "nlc.library.tab.v1"])).filter((entry): entry is [string, string] => entry[1] !== null)),
    preferences: { theme: parseNativeAppearance(await AsyncStorage.getItem(APPEARANCE_KEY)), locale: await loadLocale() }, capabilities: { localFolders: false, devicePermissions: false, desktopServers: false, camera: false, updates: false }, desktop: host };
  } else if (request.path === "/api/v1/commands") data = await executeCommand(JSON.parse(body), host.bundleId!);
  else if (request.path.startsWith("/api/v1/media/")) { native.resolveWebRequest(request.requestId, JSON.stringify(await serialize(()=>resolveMedia(request.path)))); return; }
  else throw new BackendError(404, "unknown_endpoint");
  native.resolveWebRequest(request.requestId, JSON.stringify({ status: 200, body: JSON.stringify(data) }));
 } catch (error) {
  native.resolveWebRequest(request.requestId, JSON.stringify({ status: error instanceof BackendError ? error.status : 400, body: JSON.stringify({ error: error instanceof Error ? error.message : "invalid_request", details: error instanceof BackendError ? error.details : undefined }) }));
 }
}
