import * as Crypto from "expo-crypto";
import { observeVersions, expectedEditVersion, confirmEdit, editGeneration } from "./edit-drafts";
import { getDb, runInTransaction } from "@/lib/db/client";
import { operations, installLocalBackend } from "./registry";
import { backendTransaction } from "./transaction-scope";
import { BackendError, type Command, type NlcBackend, type OperationOptions, type Reply } from "./protocol";
import { localMoveLocked } from "@/lib/local/move-lock";
import { publishWebEvent } from "./native-module";
let afterMutation: (domain: string) => Promise<void> = async () => {};
export async function runMutationEffects(domain:string) {await afterMutation(domain);}
export function setAfterMutation(fn: typeof afterMutation) { afterMutation = fn; }
let restoring = false;
export async function assertWriteAvailable() {if(restoring)throw new BackendError(423,"restore_in_progress");if(await localMoveLocked(await getDb()))throw new BackendError(423,"move_in_progress");}
export async function withExclusiveRestore<T>(task: () => Promise<T>): Promise<T> { if (restoring) throw new BackendError(423, "restore_in_progress"); restoring = true; try { await drainWrites(); return await task(); } finally { restoring = false; } }
export { serialize } from "./write-queue";
import { serialize, drainWrites } from "./write-queue";
async function versions(domain: string) {
  const rows = await (await getDb()).getAllAsync<{ key: string; version: number }>("SELECT key, version FROM backend_versions WHERE domain = ?", domain);
  return Object.fromEntries(rows.map(row => [row.key, row.version]));
}
async function perform<T>(operation: string, args: unknown[], options: OperationOptions, task: () => Promise<T>, request?: Command, sentGeneration = editGeneration()): Promise<Reply<T>> {
  if (restoring && (options.write || ["weight", "training", "medication", "body", "nutrition", "healthBackup"].includes(options.domain) || operation.startsWith("source."))) throw new BackendError(423, "Restauración en curso en el móvil");
  const db = await getDb();
  const key = `${options.domain}:${options.key?.(args) ?? "$collection"}`;
  const fingerprint = request ? await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify([request.operation, request.args, request.expectedVersion, request.expectedDomainVersion])) : "";
  if (request && options.write) {
    const previous = await db.getFirstAsync<{ fingerprint: string; result: string | null }>("SELECT fingerprint, result FROM backend_requests WHERE id = ?", request.requestId);
    if (previous) { if (previous.fingerprint !== fingerprint) throw new BackendError(409, "request_id_reused"); if (!previous.result) throw new BackendError(409, "interrupted_operation_reload"); return JSON.parse(previous.result); }
  }
  if (options.write && await localMoveLocked(db)) throw new BackendError(423, "Los archivos se están trasladando en el móvil");
  const work = async () => {
    if (options.write) {
      const expected = request ? request.expectedVersion : expectedEditVersion(options.domain, key);
      if (expected !== undefined || request) {
        const current = await db.getFirstAsync<{ version: number }>("SELECT version FROM backend_versions WHERE key = ?", key);
        if (expected !== (current?.version ?? 0)) throw new BackendError(409, "El registro ha cambiado. Conservamos tu borrador; recarga antes de guardar.");
      }
      if (request?.expectedDomainVersion !== undefined) {
        const domain = await db.getFirstAsync<{ version: number }>("SELECT version FROM backend_versions WHERE key = ?", `${options.domain}:$collection`);
        if (request.expectedDomainVersion !== (domain?.version ?? 0)) throw new BackendError(409, "version_conflict");
      }
    }
    if (request && options.write) {
      const row = await db.getFirstAsync<{ version: number }>("SELECT version FROM backend_versions WHERE key = ?", key);
      if (request.expectedVersion !== (row?.version ?? 0)) throw new BackendError(409, "version_conflict", { key, version: row?.version ?? 0 });
    }
    if (request && options.write) await db.runAsync("INSERT INTO backend_requests(id, fingerprint, result, created_at) VALUES (?, ?, NULL, ?)", request.requestId, fingerprint, Date.now());
    const beforeVersions = options.write ? await versions(options.domain) : {};
    const data = await task();
    if (options.write) {
      const afterVersions = await versions(options.domain);
      for (const changed of new Set([key, `${options.domain}:$collection`])) if ((afterVersions[changed] ?? 0) === (beforeVersions[changed] ?? 0)) await db.runAsync("INSERT INTO backend_versions(key, domain, version) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET version = version + 1", changed, options.domain);
    }
    const reply = { data: data === undefined ? null as T : data, versions: await versions(options.domain) };
    if (request && options.write) await db.runAsync("UPDATE backend_requests SET result = ? WHERE id = ?", JSON.stringify(reply), request.requestId);
    return reply;
  };
  const reply = options.write && options.atomic !== false ? await runInTransaction(db, () => backendTransaction(work, db)) : await work();
  if (!request) { observeVersions(reply.versions); if (options.write) confirmEdit(options.domain, sentGeneration, reply.versions); }
  if (options.write) { try { await afterMutation(options.domain); } catch { publishWebEvent({ type: "effect-error", domain: options.domain }); } }
  if (options.write) publishWebEvent({ type: "change", domain: options.domain, key, versions: reply.versions });
  return reply;
}
export const localBackend: NlcBackend = { invoke: (operation, args, options, task) => { const generation = editGeneration(); return serialize(async () => (await perform(operation, args, options, task!, undefined, generation)).data); } };
export function enableLocalBackend() { installLocalBackend(localBackend); }
function validate(value: unknown, depth = 0): void {
  if (depth > 20) throw new BackendError(400, "invalid_arguments");
  if (typeof value === "string" && value.length > 1048576 || typeof value === "number" && !Number.isFinite(value)) throw new BackendError(400, "invalid_arguments");
  if (Array.isArray(value)) { if (value.length > 50000) throw new BackendError(400, "invalid_arguments"); value.forEach(item => validate(item, depth + 1)); }
  else if (value && typeof value === "object") { for (const [key, item] of Object.entries(value)) { if (["__proto__", "constructor", "prototype"].includes(key)) throw new BackendError(400, "invalid_arguments"); validate(item, depth + 1); } }
}
export function executeCommand(request: Command, bundleId: string): Promise<Reply> {
  return serialize(async () => {
    if (request.protocol !== 1 || request.bundleId !== bundleId) throw new BackendError(426, "interface_update_required");
    if (typeof request.requestId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(request.requestId) || !Array.isArray(request.args) || request.args.length > 20) throw new BackendError(400, "invalid_command");
    const operation = operations.get(request.operation); if (!operation) throw new BackendError(404, "unknown_operation");
    if (operation.options.phoneOnly) throw new BackendError(403, "Se configura en el móvil");
    validate(request.args);
    return perform(request.operation, request.args, operation.options, () => operation.implementation(...request.args), request);
  });
}
