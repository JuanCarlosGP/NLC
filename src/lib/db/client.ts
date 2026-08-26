import { openDatabaseAsync } from "expo-sqlite";
import { SCHEMA_SQL } from "@/lib/db/schema";
import type { CatalogDb } from "@/lib/db/types";

const DB_NAME = "nlc-catalog.db";
const SCHEMA_VERSION = "6";

let opened: Promise<CatalogDb> | null = null;

async function ensureWealthAssetAccountColumn(db: CatalogDb): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(wealth_assets)");
  if (!cols.length || cols.some((col) => col.name === "account_id")) return;
  await db.execAsync("ALTER TABLE wealth_assets ADD COLUMN account_id TEXT");
}

export async function getDb(): Promise<CatalogDb> {
  if (!opened) {
    opened = (async () => {
      const db = await openDatabaseAsync(DB_NAME);
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await db.execAsync("PRAGMA foreign_keys = ON;");
      await db.execAsync(SCHEMA_SQL);
      await ensureWealthAssetAccountColumn(db);
      await db.execAsync("CREATE INDEX IF NOT EXISTS wealth_assets_account ON wealth_assets(account_id)");
      const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'schema'");
      if (row?.value !== SCHEMA_VERSION) {
        await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)", SCHEMA_VERSION);
      }
      return db;
    })().catch((error) => {
      opened = null;
      throw error;
    });
  }
  return opened;
}
