import {runTrackAudioJob} from "./track-jobs.native";
import { runHealthBackupJob } from "./health-backup.native";
import * as FileSystem from "expo-file-system/legacy";
import { expose } from "./registry";
import { webNative, publishWebEvent } from "./native-module";
import { BackendError } from "./protocol";
import { SERVICES, localFolder } from "@/lib/settings/service-source";
import { loadNasSettings, loadNasPassword, type ServiceId } from "@/lib/settings/storage.impl";
import { createArchivePlan } from "@/lib/service-backup/plan";
import { prepareArchive, exportArchive, discardArchive, archiveProgress, type ArchiveStage } from "@/lib/service-backup/native";
import { restoreService } from "@/lib/service-backup/restore";
import { archiveSummary, validateServiceArchive } from "@/lib/service-backup/model";
const active = new Set<string>();
expose("transfers.run", async (id: string, action: string, service: ServiceId) => {
 if (!SERVICES.includes(service) || !["preview", "restore", "export"].includes(action)) throw new BackendError(400, "invalid_transfer");
 const native = webNative(), job = JSON.parse((await native.webTransferInfo(id)).state);
 if (job.private?.service && job.private.service !== service) throw new BackendError(400, "invalid_transfer");
 if (job.status === "processing" || job.private?.restored || job.status === "complete" && (action === "export" && job.action === action || action === "preview" && job.private?.stage)) return { ...job, private: undefined };
 if (!["uploaded", "complete"].includes(job.status)) throw new BackendError(409, "incomplete_transfer");
 if (action === "restore" && !job.private?.stage) throw new BackendError(409, "preview_required");
 if (action === "restore" && job.private?.service !== service) throw new BackendError(400, "invalid_transfer");
 if (action === "restore" && ["music", "podcast", "video"].includes(service) && !localFolder(await loadNasSettings(), service).uri) throw new BackendError(403, "Elige la carpeta multimedia en el móvil");
 await native.updateWebTransfer(id, JSON.stringify({ status: "processing", service, action, private: { ...job.private, service, action } })); native.startWebJob(id, action);
 return { id, status: "processing", name: job.name, bytes: job.bytes };
}, { domain: "transfers", atomic: false });
export async function runWebJob(id: string, action: string) {
 if(action==="mercury-sync")return (await import("@/lib/integrations/mercury-controller.native")).finishMercuryTask(id);
 if(action==="track-audio-replace")return runTrackAudioJob(id);
 if (action.startsWith("health-")) return runHealthBackupJob(id, action.slice(7));
 if (active.has(id)) return; active.add(id); const native = webNative();
 let stage: ArchiveStage | null = null;
 let listener: { remove(): void } | null = null;
 try {
  const upload = await native.webTransferInfo(id), job = JSON.parse(upload.state), service: ServiceId = job.private.service;
  if (job.status !== "processing" || job.private.action !== action) return;
  const settings = await loadNasSettings();
  let last = 0;
  listener = archiveProgress(progress => { if (progress.job && progress.job !== id)return; if (Date.now() - last > 150) { last = Date.now(); void native.updateWebTransfer(id, JSON.stringify({ progress })); } });
  if (action === "preview") {
   stage = await prepareArchive(upload.uri, id); const data = validateServiceArchive(JSON.parse(stage.metadata), service);
   if (data.files.some(path => !stage!.files[path]) || Object.keys(stage.files).length !== data.files.length) throw new Error("integrity");
   await native.updateWebTransfer(id, JSON.stringify({ status: "complete", private: { service, stage }, result: { summary: archiveSummary(data), createdAt: data.createdAt } })); stage = null;
  } else if (action === "restore") {
   stage = job.private.stage;
   // Holds the shared backend write barrier for the entire restore, including file copying.
   await withExclusiveRestore(async () => restoreService(stage!, service, settings, localFolder(settings, service).uri || null, id, { preserveSources: true, beforeCommit: async () => { await native.commitWebTransfer(id); } }));
   await native.updateWebTransfer(id, JSON.stringify({ status: "complete", result: { restored: true }, private: { service, restored: true } }));
   if(service==="health")await Promise.all([runMutationEffects("medication"),runMutationEffects("training")]).catch(()=>{});
   publishWebEvent({ type: "change", domain: "*" });
  } else if (action === "export") {
   const plan = await createArchivePlan(service, settings, await loadNasPassword()); const uri = `${FileSystem.cacheDirectory}nlc-web-${id}.zip`;
   await exportArchive(uri, plan.data, plan.files, id, plan.authorize);
   const info = await FileSystem.getInfoAsync(uri); if (!info.exists || info.isDirectory) throw new Error("storage");
   await native.updateWebTransfer(id, JSON.stringify({ status: "complete", resultUri: uri, bytes: info.size, name: `nlc-${service}.zip`, mime: "application/zip" }));
  }
 } catch (error) {
  if (action === "restore" && await (await getDb()).getFirstAsync("SELECT id FROM service_import_receipts WHERE id=?",id)) { await native.updateWebTransfer(id,JSON.stringify({status:"complete",result:{restored:true},private:{restored:true}})).catch(()=>{}); }
  else await native.updateWebTransfer(id, JSON.stringify({ status: "error", error: error instanceof Error ? error.message : "storage" })).catch(() => {}); }
 finally { if (stage) await discardArchive(stage).catch(() => {}); listener?.remove(); active.delete(id); }
}
import { withExclusiveRestore, runMutationEffects } from "./native";

import { getDb } from "@/lib/db/client";
