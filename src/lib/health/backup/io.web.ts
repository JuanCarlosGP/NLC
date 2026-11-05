import { remoteEnabled } from "@/lib/backend/profile";
import { pickUpload, uploadFile, downloadTransfer } from "@/lib/backend/transfers";
import { remoteFile, remoteFileId } from "./remote-files";
import { BackupError, MAX_BACKUP_BYTES } from "./model";
export async function pickHealthBackup(): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (remoteEnabled) { const file = await pickUpload(".zip,application/zip"); if (!file) return null; if (file.size > MAX_BACKUP_BYTES) throw new BackupError("size"); return { name: file.name, bytes: remoteFile((await uploadFile(file, file.name)).id) }; }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".zip,application/zip"; input.style.display = "none"; document.body.appendChild(input);
    input.addEventListener("cancel", () => { input.remove(); resolve(null); }, { once: true });
    input.addEventListener("change", () => { const file = input.files?.[0]; input.remove(); if (!file) return resolve(null);
      if (file.size > MAX_BACKUP_BYTES) return reject(new BackupError("size"));
      void file.arrayBuffer().then((buffer) => resolve({ name: file.name, bytes: new Uint8Array(buffer) }), reject);
    }, { once: true }); input.click();
  });
}
export async function saveHealthBackup(bytes: Uint8Array, name: string): Promise<boolean> {
  if (remoteEnabled) { downloadTransfer(remoteFileId(bytes)); return true; }
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }); const uri = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = uri; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(uri), 60000); return true;
}
