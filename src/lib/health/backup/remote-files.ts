// Opaque browser handles preserve the existing screen contract. No ZIP bytes enter command JSON.
const files = new WeakMap<Uint8Array, string>();
export function remoteFile(id: string) { const handle = new Uint8Array(0); files.set(handle, id); return handle; }
export function remoteFileId(handle: Uint8Array) { const id = files.get(handle); if (!id) throw new Error("invalid_transfer"); return id; }
