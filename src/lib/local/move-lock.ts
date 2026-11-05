import { getDb } from "@/lib/db/client";
import type { CatalogDb } from "@/lib/db/types";
export const MOVE_ACTIVE = "local_move_active";
const listeners = new Set<(active: boolean) => void>();
export const onLocalMoveLock = (fn: (active: boolean) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export async function localMoveLocked(db?: CatalogDb) {
  return !!(await (db ?? (await getDb())).getFirstAsync(
    "SELECT value FROM meta WHERE key = ?",
    MOVE_ACTIVE,
  ));
}
export function notifyLocalMoveLock(active: boolean) {
  for (const fn of listeners) fn(active);
}

// Drain source work started before the durable move lock was acquired.
const sourceWork = new Set<Promise<unknown>>();
export function withLocalSourceSync<T>(task: () => Promise<T>): Promise<T> {
  const result = task();
  sourceWork.add(result);
  void result.then(
    () => sourceWork.delete(result),
    () => sourceWork.delete(result),
  );
  return result;
}
export async function drainLocalSourceSync() {
  await Promise.allSettled([...sourceWork]);
}
