import { localMoveLocked, withLocalSourceSync } from "@/lib/local/move-lock";
import { serviceImportEpoch } from "@/lib/service-backup/epochs";
import { usesNas, usesLocal } from "@/lib/settings/service-source";
import { t } from "@/lib/i18n/runtime";
import { joinPath } from "@/lib/nas/webdav";
import { getWebDavText, putWebDavText } from "@/lib/nas/webdav-source";
import type { NasSettings } from "@/lib/settings/storage";
import { focusSourceSettings } from "@/lib/settings/storage";
import { dumpProductivity, replaceProductivity } from "@/lib/productivity/store";
import {
  FOCUS_FILE,
  parseFocusDump,
  readLocalFocusFile,
  writeLocalFocusFile,
  type FocusDump,
} from "@/lib/productivity/local-file";
import { listReminders, replaceReminders } from "@/lib/reminders/store";
import { INBOX_PROJECT_ID } from "@/lib/productivity/types";

const storeListeners = new Set<() => void>();

export function onFocusStoreChanged(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

function emitFocusStoreChanged() {
  for (const listener of storeListeners) listener();
}

function focusDavPath(settings: NasSettings): string {
  const conn = focusSourceSettings(settings);
  return joinPath(conn.sharePath, FOCUS_FILE);
}

export async function dumpFocus(): Promise<FocusDump> {
  const [{ projects, tasks }, reminders] = await Promise.all([dumpProductivity(), listReminders()]);
  let updatedAt = await serviceImportEpoch("focus");
  for (const rows of [projects, tasks, reminders]) for (const row of rows) updatedAt = Math.max(updatedAt, row.createdAt, "updatedAt" in row ? row.updatedAt : 0);
  return { version: 1, updatedAt, projects, tasks, reminders };
}

async function replaceFocus(dump: FocusDump): Promise<void> {
  await replaceProductivity({ projects: dump.projects, tasks: dump.tasks });
  await replaceReminders(dump.reminders);
  emitFocusStoreChanged();
}

async function readNasFocus(settings: NasSettings, password: string): Promise<FocusDump | null> {
  if (!usesNas(settings, "focus") || !password || !settings.focusSharePath.trim()) return null;
  try {
    const raw = await getWebDavText(focusSourceSettings(settings), password, focusDavPath(settings));
    return parseFocusDump(raw);
  } catch {
    return null;
  }
}

async function writeNasFocus(settings: NasSettings, password: string, dump: FocusDump): Promise<void> {
  if (!usesNas(settings, "focus") || !password || !settings.focusSharePath.trim()) return;
  await putWebDavText(
    focusSourceSettings(settings),
    password,
    focusDavPath(settings),
    `${JSON.stringify(dump, null, 2)}\n`,
  );
}

function pickNewer(a: FocusDump | null, b: FocusDump | null): FocusDump | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

function isLocalEmpty(dump: FocusDump): boolean {
  const extraProjects = dump.projects.filter((item) => item.id !== INBOX_PROJECT_ID);
  return dump.tasks.length === 0 && extraProjects.length === 0 && dump.reminders.length === 0;
}

async function pullFocusFromSourcesUnlocked(settings: NasSettings, password: string): Promise<boolean> {
  if (await localMoveLocked()) return false;
  const local = await dumpFocus();
  const remoteNas = await readNasFocus(settings, password);
  const remoteFolder = usesLocal(settings, "focus") && settings.focusLocalFolderUri
    ? await readLocalFocusFile(settings.focusLocalFolderUri)
    : null;
  const incoming = pickNewer(remoteNas, remoteFolder);
  if (!incoming) return false;
  if (!isLocalEmpty(local) && incoming.updatedAt <= local.updatedAt) return false;
  if (await localMoveLocked()) return false;
  await replaceFocus(incoming);
  return true;
}

async function pushFocusToSourcesUnlocked(settings: NasSettings, password: string): Promise<string | null> {
  if (await localMoveLocked()) return null;
  const dump = { ...(await dumpFocus()), updatedAt: Date.now() };
  if (await localMoveLocked()) return null;
  const writes: Promise<void>[] = [];
  if (usesLocal(settings, "focus") && settings.focusLocalFolderUri) {
    writes.push(writeLocalFocusFile(settings.focusLocalFolderUri, dump));
  }
  if (usesNas(settings, "focus") && settings.focusSharePath.trim() && password) {
    writes.push(writeNasFocus(settings, password, dump));
  }
  if (!writes.length) return null;
  const results = await Promise.allSettled(writes);
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      const reason = result.reason;
      console.warn("No se pudieron copiar las tareas", reason);
      errors.push(reason instanceof Error ? reason.message : t("feedback.writeTasksFail"));
    }
  }
  return errors[0] ?? null;
}

export function pullFocusFromSources(settings: NasSettings, password: string): Promise<boolean> {
  return withLocalSourceSync(() => pullFocusFromSourcesUnlocked(settings, password));
}

export function pushFocusToSources(settings: NasSettings, password: string): Promise<string | null> {
  return withLocalSourceSync(() => pushFocusToSourcesUnlocked(settings, password));
}
