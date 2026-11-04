import { createMemoryDb } from "@/lib/db/memory";
import { localDemoEnabled } from "@/lib/dev/local-demo";
import type { CatalogDb } from "@/lib/db/types";

let opened: Promise<CatalogDb> | null = null;

export async function getDb(): Promise<CatalogDb> {
  if (localDemoEnabled) {
    const sqlite = await import("./sqlite-client");
    return sqlite.getDb();
  }
  if (!opened) {
    opened = Promise.resolve(createMemoryDb());
  }
  return opened;
}

let txQueue: Promise<unknown> = Promise.resolve();

// Keep the same contract as client.ts: catalogue migration also runs on web.
export async function runInTransaction<T = void>(db: CatalogDb, task: () => Promise<T>): Promise<T> {
  const previous = txQueue;
  let release!: () => void;
  txQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => {});
  try {
    let result!: T;
    await db.withTransactionAsync(async () => { result = await task(); });
    return result;
  } finally { release(); }
}
