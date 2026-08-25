import { joinPath } from "@/lib/nas/webdav";
import { getWebDavText, putWebDavText } from "@/lib/nas/webdav-source";
import type { NasSettings } from "@/lib/settings/storage";
import { wealthSourceSettings } from "@/lib/settings/storage";
import { dumpWealth, replaceWealth, type WealthDump } from "@/lib/wealth/store";
import { parseWealthDump, readLocalWealthFile, writeLocalWealthFile } from "@/lib/wealth/local-file";

export const WEALTH_FILE = "nlc-wealth.json";

const storeListeners = new Set<() => void>();

export function onWealthStoreChanged(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

function emitWealthStoreChanged() {
  for (const listener of storeListeners) listener();
}

function wealthDavPath(settings: NasSettings): string {
  const conn = wealthSourceSettings(settings);
  return joinPath(conn.sharePath, WEALTH_FILE);
}

async function readNasWealth(settings: NasSettings, password: string): Promise<WealthDump | null> {
  if (!password || !settings.wealthSharePath.trim()) return null;
  try {
    const raw = await getWebDavText(wealthSourceSettings(settings), password, wealthDavPath(settings));
    return parseWealthDump(raw);
  } catch {
    return null;
  }
}

async function writeNasWealth(settings: NasSettings, password: string, dump: WealthDump): Promise<void> {
  if (!password || !settings.wealthSharePath.trim()) return;
  await putWebDavText(
    wealthSourceSettings(settings),
    password,
    wealthDavPath(settings),
    `${JSON.stringify(dump, null, 2)}\n`,
  );
}

function pickNewer(a: WealthDump | null, b: WealthDump | null): WealthDump | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

export async function pullWealthFromSources(settings: NasSettings, password: string): Promise<boolean> {
  const local = await dumpWealth();
  const remoteNas = await readNasWealth(settings, password);
  const remoteFolder = settings.wealthLocalFolderUri
    ? await readLocalWealthFile(settings.wealthLocalFolderUri)
    : null;
  const incoming = pickNewer(remoteNas, remoteFolder);
  if (!incoming) return false;
  const localEmpty =
    local.txs.length === 0 &&
    local.assets.length === 0 &&
    local.accounts.length <= 1 &&
    !(local.goals?.length);
  if (!localEmpty && incoming.updatedAt <= local.updatedAt) return false;
  await replaceWealth(incoming);
  emitWealthStoreChanged();
  return true;
}

export async function pushWealthToSources(settings: NasSettings, password: string): Promise<string | null> {
  const dump = { ...(await dumpWealth()), updatedAt: Date.now() };
  const writes: Promise<void>[] = [];
  if (settings.wealthLocalFolderUri) {
    writes.push(writeLocalWealthFile(settings.wealthLocalFolderUri, dump));
  }
  if (settings.wealthSharePath.trim() && password) {
    writes.push(writeNasWealth(settings, password, dump));
  }
  if (!writes.length) return null;
  const results = await Promise.allSettled(writes);
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      const reason = result.reason;
      console.warn("No se pudo copiar el patrimonio", reason);
      errors.push(reason instanceof Error ? reason.message : "No se pudo escribir nlc-wealth.json.");
    }
  }
  return errors[0] ?? null;
}
