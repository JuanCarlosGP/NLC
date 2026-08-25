import { Platform } from "react-native";
import type { ProdProject, ProdTask } from "@/lib/productivity/types";
import type { ProdReminder } from "@/lib/reminders/types";

export const FOCUS_FILE = "nlc-tasks.json";

export type FocusDump = {
  version: 1;
  updatedAt: number;
  projects: ProdProject[];
  tasks: ProdTask[];
  reminders: ProdReminder[];
};

export function parseFocusDump(raw: string): FocusDump | null {
  try {
    const parsed = JSON.parse(raw) as Partial<FocusDump>;
    if (parsed.version !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.tasks)) {
      return null;
    }
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      projects: parsed.projects,
      tasks: parsed.tasks,
      reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
    };
  } catch {
    return null;
  }
}

function looksLikeFocusFile(uri: string): boolean {
  try {
    return decodeURIComponent(uri).toLowerCase().includes(FOCUS_FILE);
  } catch {
    return uri.toLowerCase().includes(FOCUS_FILE);
  }
}

export async function readLocalFocusFile(dirUri: string): Promise<FocusDump | null> {
  if (!dirUri || Platform.OS === "web") return null;
  const FileSystem = await import("expo-file-system/legacy");
  const { StorageAccessFramework } = FileSystem;
  try {
    const children = await StorageAccessFramework.readDirectoryAsync(dirUri);
    const uri = children.find((item) => looksLikeFocusFile(item));
    if (!uri) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    return parseFocusDump(raw);
  } catch {
    return null;
  }
}

export async function writeLocalFocusFile(dirUri: string, dump: FocusDump): Promise<void> {
  if (!dirUri || Platform.OS === "web") return;
  const FileSystem = await import("expo-file-system/legacy");
  const { StorageAccessFramework } = FileSystem;
  const children = await StorageAccessFramework.readDirectoryAsync(dirUri);
  let uri = children.find((item) => looksLikeFocusFile(item));
  if (!uri) {
    uri = await StorageAccessFramework.createFileAsync(dirUri, FOCUS_FILE, "application/json");
  }
  await FileSystem.writeAsStringAsync(uri, `${JSON.stringify(dump, null, 2)}\n`);
}
