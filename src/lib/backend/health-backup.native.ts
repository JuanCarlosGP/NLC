import * as FileSystem from "expo-file-system/legacy";
import { expose } from "./registry";
import { BackendError } from "./protocol";
import { webNative, publishWebEvent } from "./native-module";
import { withExclusiveRestore, runMutationEffects } from "./native";
import { healthBackup } from "@/lib/health/backup/service.local";
import { MAX_BACKUP_BYTES } from "@/lib/health/backup/model";
import { readAndroidBackupFile, writeAndroidBackupFile } from "@/lib/health/backup/native-files";
const active = new Set<string>();
for (const method of ["currentInfo", "recoveryInfo"] as const) expose(`health.backup.${method}`, () => healthBackup[method](), { domain: "healthBackup", atomic: false });
expose("health.backup.run", async (id: string, action: string) => {
 if (!["inspect", "export", "recovery", "restore"].includes(action)) throw new BackendError(400, "invalid_transfer");
 const native = webNative(), job = JSON.parse((await native.webTransferInfo(id)).state);
 if (job.status === "processing" || job.private?.restored) return;
 if (!["uploaded", "complete"].includes(job.status) || job.bytes > MAX_BACKUP_BYTES) throw new BackendError(400, "invalid_transfer");
 if (action === "restore" && !job.private?.healthValidated) throw new BackendError(409, "preview_required");
 await native.updateWebTransfer(id, JSON.stringify({status:"processing",private:{...job.private, healthAction:action}}));
 native.startWebJob(id, `health-${action}`);
}, {domain:"healthBackup",atomic:false});
export async function runHealthBackupJob(id: string, action: string) {
 if (active.has(id)) return; active.add(id); const native = webNative();
 try {
  const info = await native.webTransferInfo(id), job = JSON.parse(info.state);
  if (job.status !== "processing" || job.private?.healthAction !== action) return;
  const check = async () => { if (JSON.parse((await native.webTransferInfo(id)).state).status !== "processing") throw new Error("cancelled"); };
  if (action === "inspect") {
   const result = await healthBackup.inspect(await readAndroidBackupFile(info.uri, MAX_BACKUP_BYTES)); await check();
   await native.updateWebTransfer(id, JSON.stringify({status:"complete",result,private:{healthValidated:true}}));
  } else if (action === "restore") {
   const bytes = await readAndroidBackupFile(info.uri, MAX_BACKUP_BYTES);
   const result = await withExclusiveRestore(() => healthBackup.restore(bytes, async () => { await native.commitWebTransfer(id); }, id));
   await native.updateWebTransfer(id, JSON.stringify({status:"complete",result,private:{restored:true}})); await Promise.all([runMutationEffects("medication"),runMutationEffects("training")]).catch(()=>{}); publishWebEvent({type:"change",domain:"*"});
  } else {
   const backup = action === "export" ? await healthBackup.export() : {bytes:await healthBackup.recoveryBytes(),info:await healthBackup.recoveryInfo()};
   await check(); if (!backup.bytes) { await native.updateWebTransfer(id,JSON.stringify({status:"complete",result:null})); return; }
   const uri = `${FileSystem.cacheDirectory}nlc-web-${id}.zip`; await writeAndroidBackupFile(uri, backup.bytes); await check();
   await native.updateWebTransfer(id,JSON.stringify({status:"complete",result:backup.info,resultUri:uri,bytes:backup.bytes.length,name:"nlc-health.zip",mime:"application/zip"}));
  }
 } catch(error) { await native.updateWebTransfer(id,JSON.stringify({status:"error",error:error instanceof Error ? error.message : "storage"})).catch(() => {}); }
 finally {active.delete(id);}
}
