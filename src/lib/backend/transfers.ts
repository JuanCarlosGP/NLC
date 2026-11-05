import { uploadProgress } from "./upload-progress";
import { browserBackend, requestId } from "./remote";
import { BackendError } from "./protocol";
export type Transfer = { id: string; name: string; bytes: number; offset: number; status: "uploading" | "uploaded" | "processing" | "complete" | "error" | "cancelled"; phase?: string; progress?: { bytes: number; files: number }; result?: any; error?: string; service?: string; createdAt?: number; downloadAvailable?: boolean };
async function transferRequest(path: string, init?: RequestInit): Promise<Transfer> {
 const response = await fetch(`/api/v1/transfers${path}`, { ...init, headers: { "X-NLC-Protocol": "1", ...init?.headers } }); const result = await response.json();
 if (!response.ok) throw new BackendError(response.status, result.error || "transfer_failed", result); return result;
}
export const getTransfer = (id: string) => transferRequest(`/${encodeURIComponent(id)}`);
export const cancelTransfer = (id: string) => transferRequest(`/${encodeURIComponent(id)}`, { method: "DELETE" });
export async function uploadFile(file: Blob, name: string, progress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<Transfer> {
 const controller = new AbortController(); const abort = () => controller.abort(); signal?.addEventListener("abort",abort,{once:true}); if(signal?.aborted)controller.abort();
 const externalProgress = progress;
 if(!progress) {progress=(done,total)=>uploadProgress.set({name,done,total,cancel:abort}); progress(0,file.size);}
 signal=controller.signal;
 const id = requestId(); let value; try { value = await transferRequest("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name, bytes: file.size }), signal });
  while (value.offset < file.size) {
   if (signal?.aborted) throw new Error("cancelled");
   const blob = file.slice(value.offset, Math.min(file.size, value.offset + 4 * 1024 * 1024));
   try { value = await transferRequest(`/${id}`, { method: "PUT", headers: { "X-NLC-Offset": String(value.offset), "Content-Type": "application/octet-stream" }, body: blob, signal }); }
   catch (error) { if (signal?.aborted) throw error; const resumed = await getTransfer(id); if (resumed.offset === value.offset) throw error; value = resumed; }
   progress?.(value.offset, file.size);
  }
  return value;
 } catch (error) { await cancelTransfer(id).catch(() => {}); throw error; }
 finally { if(!externalProgress)uploadProgress.set(null); }
}
export async function beginExport(service: string) {
 const job = await uploadFile(new Blob([]), `nlc-${service}.zip`);
 return runTransfer(job.id, "export", service);
}
export async function runTransfer(id: string, action: "preview" | "restore" | "export", service: string): Promise<Transfer> {
 return browserBackend.invoke("transfers.run", [id, action, service], { domain: "transfers", atomic: false });
}
export function downloadTransfer(id: string) { const anchor = document.createElement("a"); anchor.href = `/api/v1/transfers/${encodeURIComponent(id)}/download`; anchor.download = ""; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }
export async function awaitTransfer(id: string, progress?: (job: Transfer) => void, signal?: AbortSignal): Promise<Transfer> {
 for (;;) {
  if (signal?.aborted) throw new Error("cancelled");
  const job = await getTransfer(id); progress?.(job);
  if (job.status === "complete") return job;
  if (["cancelled", "error"].includes(job.status)) throw new Error(job.error || job.status);
  await new Promise(resolve => setTimeout(resolve, 600));
 }
}
export function pickUpload(accept = "*/*"): Promise<File | null> {
 return new Promise(resolve => { const input = document.createElement("input"); input.type = "file"; input.accept = accept; input.hidden = true; document.body.appendChild(input); input.addEventListener("cancel", () => { input.remove(); resolve(null); }, { once: true }); input.onchange = () => { const file = input.files?.[0] || null; input.remove(); resolve(file); }; input.click(); });
}

export async function listTransfers():Promise<Transfer[]> {const response=await fetch("/api/v1/transfers",{cache:"no-store"});if(!response.ok)throw new Error("phone_unavailable");return (await response.json()).items;}
