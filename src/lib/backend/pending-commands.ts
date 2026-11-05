import { md5Hex } from "../crypto/md5";
type Intent = { requestId: string; expectedVersion?: number; expectedDomainVersion?: number; at: number };
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
/** Stores identifiers and argument fingerprints, never credentials, files or another library. */
export function createPendingCommands(makeId: () => string, storage?: Storage) {
 const KEY = "nlc.remote.pending-commands.v1"; let pending: Record<string, Intent> = {};
 try { pending = JSON.parse(storage?.getItem(KEY) || "{}"); } catch {}
 const persist = () => { try { storage?.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(pending).filter(([key]) => !/credential|password|token|configure/i.test(key.split(":")[0]))))); } catch {} };
 const keyFor = (operation: string, args: unknown[]) => `${operation}:${md5Hex(JSON.stringify(args))}`;
 function begin(operation: string, args: unknown[], versions: Omit<Intent, "requestId" | "at">) {
  const key = keyFor(operation, args); const now = Date.now();
  for (const [id, item] of Object.entries(pending)) if (now - item.at > 86400000) delete pending[id];
  const previous = pending[key]; if (previous) return { key, ...previous };
  if (Object.keys(pending).length >= 30) delete pending[Object.keys(pending)[0]];
  const intent = { requestId: makeId(), ...versions, at: now }; pending[key] = intent;
  // A new secret value never needs to survive a reload; do not persist even its fingerprint.
  if (!/credential|password|token|configure/i.test(operation)) persist();
  return { key, ...intent };
 }
 function finish(key: string) { delete pending[key]; persist(); }
 return { begin, finish };
}
