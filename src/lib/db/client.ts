import { openDatabaseAsync } from "expo-sqlite";
import { SCHEMA_SQL } from "@/lib/db/schema";
import type { CatalogDb } from "@/lib/db/types";

const DB_NAME = "nlc-catalog.db";
const SCHEMA_VERSION = "6";

let opened: Promise<CatalogDb> | null = null;

function isPoisonedHandle(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("NativeDatabase") && msg.includes("NullPointerException");
}

async function ensureWealthAssetAccountColumn(db: CatalogDb): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(wealth_assets)");
  if (!cols.length || cols.some((col) => col.name === "account_id")) return;
  await db.execAsync("ALTER TABLE wealth_assets ADD COLUMN account_id TEXT");
}

async function execStatements(db: CatalogDb, sql: string): Promise<void> {
  const parts = sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    await db.execAsync(`${part};`);
  }
}

async function boot(db: CatalogDb): Promise<CatalogDb> {
  // These PRAGMAs return a row. execAsync NPEs on some Android SQLite builds.
  await db.getFirstAsync("PRAGMA journal_mode = WAL");
  await db.getFirstAsync("PRAGMA foreign_keys = ON");

  let current: string | undefined;
  try {
    current = (await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'schema'"))?.value;
  } catch (error) {
    if (isPoisonedHandle(error)) throw error;
    current = undefined;
  }

  if (current !== SCHEMA_VERSION) {
    await execStatements(db, SCHEMA_SQL);
    await ensureWealthAssetAccountColumn(db);
    await db.execAsync("CREATE INDEX IF NOT EXISTS wealth_assets_account ON wealth_assets(account_id)");
    await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)", SCHEMA_VERSION);
  }

  return db;
}

async function openCatalog(useNewConnection: boolean): Promise<CatalogDb> {
  const db = await openDatabaseAsync(DB_NAME, { useNewConnection });
  return boot(db);
}

export async function getDb(): Promise<CatalogDb> {
  if (!opened) {
    opened = (async () => {
      try {
        return await openCatalog(false);
      } catch (error) {
        // After an OTA the cached native handle can be dead. A fresh connection recovers it.
        if (!isPoisonedHandle(error)) throw error;
        return await openCatalog(true);
      }
    })().catch((error) => {
      opened = null;
      throw error;
    });
  }
  return opened;
}
