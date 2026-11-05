import {transferActivity} from "@/lib/backend/transfer-activity";
import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend } from "@/lib/backend/remote";
import { uploadFile, awaitTransfer, cancelTransfer } from "@/lib/backend/transfers";
import { BackupError, type BackupErrorCode } from "./model";
import { remoteFile, remoteFileId } from "./remote-files";
import { healthBackup as local } from "./service.local";
async function run(action: string, id?: string) {
 try {
  if (!id) id = (await uploadFile(new Blob([]), "nlc-health.zip")).id;
  await browserBackend.invoke("health.backup.run", [id, action], { domain: "healthBackup", atomic: false });
  const jobId=id;return await awaitTransfer(id,job=>transferActivity.set({text:job.phase==="committing"?"Guardando en el móvil…":"Procesando en el móvil…",committing:job.phase==="committing",cancel:()=>{void cancelTransfer(jobId).catch(()=>{});}}));
 } catch(error) { const code = error instanceof Error ? error.message : "storage"; throw new BackupError((["format","version","size","integrity","missingPhoto","nativeUpdate","recovery"].includes(code) ? code : "storage") as BackupErrorCode); } finally {transferActivity.set(null); }
}
const remote: typeof local = {
 currentInfo: () => browserBackend.invoke("health.backup.currentInfo", [], { domain: "healthBackup" }),
 recoveryInfo: () => browserBackend.invoke("health.backup.recoveryInfo", [], { domain: "healthBackup" }),
 inspect: async handle => (await run("inspect", remoteFileId(handle))).result,
 export: async () => { const job = await run("export"); return { bytes: remoteFile(job.id), info: job.result }; },
 recoveryBytes: async () => { const job = await run("recovery"); return job.result ? remoteFile(job.id) : null; },
 restore: async handle => (await run("restore", remoteFileId(handle))).result,
};
export const healthBackup = remoteEnabled ? remote : local;
