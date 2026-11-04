import { parseSnapshot, validateSnapshot, type Mode, type Provider, type Snapshot } from "./model";
export type CacheStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
export function createIntegrationCache(storage: CacheStorage, prefix = "nlc.integrations.v1") {
  const key = (provider: Provider, mode: Mode) => `${prefix}.${provider}.${mode}`;
  return {
    async read(provider: Provider, mode: Mode) { const text = await storage.getItem(key(provider,mode)); if (!text) return null; const value = parseSnapshot(text,provider); if (value.mode !== mode) throw new Error("invalid"); return value; },
    async write(value: Snapshot) { validateSnapshot(value); const text = JSON.stringify(value); parseSnapshot(text,value.provider); await storage.setItem(key(value.provider,value.mode),text); },
    async clear(provider: Provider, mode: Mode) { await storage.removeItem(key(provider,mode)); },
  };
}
