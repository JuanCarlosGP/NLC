// Every public health-store operation shares this barrier with backup/restore.
// Recovery runs before reads as well as writes, including after an interrupted demo restore.
let pending: Promise<unknown> = Promise.resolve();
let recover: () => Promise<void> = async () => {};
export function registerHealthRecovery(task: () => Promise<void>) { recover = task; }
export function withHealthLock<T>(task: () => Promise<T>): Promise<T> {
  const result = pending.then(async () => { await recover(); return task(); });
  pending = result.catch(() => {}); return result;
}
export function coordinatedHealthStore<T extends object>(store: T): T {
  return Object.fromEntries(Object.entries(store).map(([key, value]) => [key, typeof value === "function" ? (...args: unknown[]) => withHealthLock(() => value(...args)) : value])) as T;
}
