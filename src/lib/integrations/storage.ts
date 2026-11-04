import { getDb } from "@/lib/db/client";
import type { CacheStorage } from "./cache";
let initialized: Promise<unknown> | null = null;
async function open() { const db = await getDb(); await (initialized ??= db.execAsync("CREATE TABLE IF NOT EXISTS integration_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL)").catch(error => { initialized = null; throw error; })); return db; }
export const integrationStorage: CacheStorage = {
  async getItem(key) { const row = await (await open()).getFirstAsync<{ payload: string }>("SELECT payload FROM integration_cache WHERE key = ?",key); return row?.payload ?? null; },
  async setItem(key,value) { await (await open()).runAsync("INSERT INTO integration_cache (key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",key,value); },
  async removeItem(key) { await (await open()).runAsync("DELETE FROM integration_cache WHERE key = ?",key); },
};
