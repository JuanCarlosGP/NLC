import { webNative } from "./native-module";
import { getDb } from "@/lib/db/client";
import { pendingArchiveCommits, finishArchiveCommit } from "@/lib/service-backup/native";
let ready:Promise<void>|null=null;
export function recoverArchiveCommits() {return ready ??= (async()=>{
 const jobs=await pendingArchiveCommits(), db=await getDb();
 for(const job of JSON.parse(await webNative().interruptedWebTransfers?.() ?? "[]")) {
  let result:unknown=null;
  if(job.healthAction==="restore") {const receipt=await db.getFirstAsync<{value:string}>("SELECT value FROM meta WHERE key=?",`health_remote_restore:${job.id}`);if(receipt)result=JSON.parse(receipt.value);}
  else if(job.action==="restore" && await db.getFirstAsync("SELECT id FROM service_import_receipts WHERE id=?",job.id))result={restored:true};
  if(result)await webNative().updateWebTransfer(job.id,JSON.stringify({status:"complete",result,private:{restored:true},error:null}));
 }
 for(const id of jobs) {const receipt=await db.getFirstAsync("SELECT id FROM service_import_receipts WHERE id=?",id); await finishArchiveCommit(id,!!receipt);}
})().catch(error=>{ready=null;throw error;});}
