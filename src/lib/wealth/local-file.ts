import { Platform } from "react-native";
import type { WealthDump } from "@/lib/wealth/store";

const FILE_NAME = "nlc-wealth.json";

export function parseWealthDump(raw: string): WealthDump | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WealthDump>;
    if (parsed.version !== 1 || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.assets) || !Array.isArray(parsed.txs)) {
      return null;
    }
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      accounts: parsed.accounts,
      assets: parsed.assets,
      txs: parsed.txs,
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    };
  } catch {
    return null;
  }
}

function looksLikeWealthFile(uri: string): boolean {
  try {
    return decodeURIComponent(uri).toLowerCase().includes(FILE_NAME);
  } catch {
    return uri.toLowerCase().includes(FILE_NAME);
  }
}

export async function readLocalWealthFile(dirUri: string): Promise<WealthDump | null> {
  if (!dirUri || Platform.OS === "web") return null;
  const FileSystem = await import("expo-file-system/legacy");
  const { StorageAccessFramework } = FileSystem;
  try {
    const children = await StorageAccessFramework.readDirectoryAsync(dirUri);
    const uri = children.find((item) => looksLikeWealthFile(item));
    if (!uri) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    return parseWealthDump(raw);
  } catch {
    return null;
  }
}

export async function writeLocalWealthFile(dirUri: string, dump: WealthDump): Promise<void> {
  if (!dirUri || Platform.OS === "web") return;
  const FileSystem = await import("expo-file-system/legacy");
  const { StorageAccessFramework } = FileSystem;
  const children = await StorageAccessFramework.readDirectoryAsync(dirUri);
  let uri = children.find((item) => looksLikeWealthFile(item));
  if (!uri) {
    uri = await StorageAccessFramework.createFileAsync(dirUri, FILE_NAME, "application/json");
  }
  await FileSystem.writeAsStringAsync(uri, `${JSON.stringify(dump, null, 2)}\n`);
}
