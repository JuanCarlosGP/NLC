import { openDatabaseAsync } from "expo-sqlite";
import { SCHEMA_SQL } from "@/lib/db/schema";
import type { CatalogDb } from "@/lib/db/types";

const DB_NAME = "snd-catalog.db";
const SCHEMA_VERSION = "2";

let opened: Promise<CatalogDb> | null = null;

export async function getDb(): Promise<CatalogDb> {
  if (!opened) {
    opened = (async () => {
      const db = await openDatabaseAsync(DB_NAME);
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await db.execAsync("PRAGMA foreign_keys = ON;");
      await db.execAsync(SCHEMA_SQL);
      const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'schema'");
      if (row?.value !== SCHEMA_VERSION) {
        await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)", SCHEMA_VERSION);
      }
      return db;
    })();
  }
  return opened;
}
