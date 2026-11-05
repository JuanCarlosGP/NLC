import { remoteEnabled } from "./profile";
import type { NlcBackend, OperationOptions } from "./protocol";
import { browserBackend } from "./remote";
type Implementation = (...args: any[]) => any;
export const operations = new Map<string, { implementation: Implementation; options: OperationOptions }>();
let localBackend: NlcBackend | null = null;
export function installLocalBackend(backend: NlcBackend) { localBackend = backend; }
export function invokeBoundary<T>(name: string, args: unknown[], options: OperationOptions, local: () => Promise<T>): Promise<T> {
 if (remoteEnabled) return browserBackend.invoke(name, args, options);
 return localBackend ? localBackend.invoke(name, args, options, local) : local();
}
/** Explicit registrations form the public command allowlist, never SQL or dynamic property access. */
export function expose<T extends Implementation>(name: string, implementation: T, options: OperationOptions): T {
  if (operations.has(name)) throw new Error(`Duplicate backend operation: ${name}`);
  operations.set(name, { implementation, options });
  return ((...args: Parameters<T>) => {
    return invokeBoundary(name, args, options, () => implementation(...args));
  }) as T;
}
export function exposeStore<T extends object>(domain: string, store: T): T {
  return Object.fromEntries(Object.entries(store).map(([method, fn]) => [method, typeof fn === "function" ? expose(`${domain}.${method}`, fn, { domain, write: !["list", "read", "getRest", "source"].includes(method), atomic: domain !== "body", phoneOnly: method === "source", key: args => {
    if (domain === "nutrition" && method === "importDays") return "$collection";
    if (domain === "training" && method === "setRest") return "$rest";
    if (domain === "weight" || domain === "nutrition") return String(args[1] || args[0]?.entryDate || args[0]?.date || args[0]);
    if (method === "save" && domain === "training") return String(args[0]?.id);
    if (method === "savePlan") return String(args[1] || "$collection");
    if (method === "save" && domain === "body") return String(args[2] || "$collection");
    if (typeof args[0] === "string") return args[0];
    return "$collection";
  } }) : fn])) as T;
}
