import { createMemoryDb } from "@/lib/db/memory";
import type { CatalogDb } from "@/lib/db/types";

let opened: Promise<CatalogDb> | null = null;

export async function getDb(): Promise<CatalogDb> {
  if (!opened) {
    opened = Promise.resolve(createMemoryDb());
  }
  return opened;
}
