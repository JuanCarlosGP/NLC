import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDb } from "@/lib/db/client";
import type { MusicSourceKind } from "@/lib/nas/types";
import { joinPath } from "@/lib/nas/webdav";
import { deleteSecret, getSecret, setSecret } from "@/lib/settings/secret-store";

const SETTINGS_KEY = "nlc.settings.v1";
const SETTINGS_META_KEY = "nas_settings";
const PASSWORD_KEY = "nlc.nas.password";

export type NasSettings = {
  sourceKind: MusicSourceKind;
  host: string;
  port: string;
  username: string;
  sharePath: string;
  useHttps: boolean;
  maxBitRate: string;
  localFolderUri: string;
  localFolderName: string;
  podcastSharePath: string;
  podcastLocalFolderUri: string;
  podcastLocalFolderName: string;
  videoHost: string;
  videoPort: string;
  videoUsername: string;
  videoSharePath: string;
  videoUseHttps: boolean;
  videoLocalFolderUri: string;
  videoLocalFolderName: string;
  wealthSharePath: string;
  wealthLocalFolderUri: string;
  wealthLocalFolderName: string;
  focusSharePath: string;
  focusLocalFolderUri: string;
  focusLocalFolderName: string;
};

export const DEFAULT_NAS_SETTINGS: NasSettings = {
  sourceKind: "webdav",
  host: "192.168.1.106",
  port: "5005",
  username: "Viewer",
  sharePath: "/volume1/Music",
  useHttps: false,
  maxBitRate: "0",
  localFolderUri: "",
  localFolderName: "",
  podcastSharePath: "/volume1/Music/Podcasts",
  podcastLocalFolderUri: "",
  podcastLocalFolderName: "",
  videoHost: "192.168.1.106",
  videoPort: "5005",
  videoUsername: "Viewer",
  videoSharePath: "/volume1/Popcorn",
  videoUseHttps: false,
  videoLocalFolderUri: "",
  videoLocalFolderName: "",
  wealthSharePath: "/volume1/Music/NLC",
  wealthLocalFolderUri: "",
  wealthLocalFolderName: "",
  focusSharePath: "/volume1/Music/NLC",
  focusLocalFolderUri: "",
  focusLocalFolderName: "",
};

function asNasFolderPath(path: string, fallback: string): string {
  const trimmed = path.trim();
  if (!trimmed) return fallback;
  if (trimmed === "/Music") return "/volume1/Music";
  if (trimmed === "/Music/Podcasts") return "/volume1/Music/Podcasts";
  if (trimmed === "/Music/NLC") return "/volume1/Music/NLC";
  if (trimmed === "/Popcorn") return "/volume1/Popcorn";
  if (trimmed === "/Documents/NLC" || trimmed === "/volume1/Documents/NLC") {
    return "/volume1/Music/NLC";
  }
  return trimmed;
}

function hydrateSettings(parsed: Partial<NasSettings>): NasSettings {
  const next = { ...DEFAULT_NAS_SETTINGS, ...parsed };
  next.sharePath = asNasFolderPath(next.sharePath, "/volume1/Music");
  next.podcastSharePath = asNasFolderPath(
    next.podcastSharePath,
    joinPath(next.sharePath, "Podcasts"),
  );
  next.videoSharePath = asNasFolderPath(next.videoSharePath, "/volume1/Popcorn");
  next.wealthSharePath = asNasFolderPath(
    next.wealthSharePath || joinPath(next.sharePath, "NLC"),
    "/volume1/Music/NLC",
  );
  next.focusSharePath = asNasFolderPath(
    next.focusSharePath || joinPath(next.sharePath, "NLC"),
    "/volume1/Music/NLC",
  );
  if (!next.podcastSharePath.trim()) {
    next.podcastSharePath = joinPath(next.sharePath, "Podcasts");
  }
  return next;
}

async function readSqliteSettings(): Promise<NasSettings | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = ?",
      SETTINGS_META_KEY,
    );
    if (!row?.value) return null;
    return hydrateSettings(JSON.parse(row.value) as Partial<NasSettings>);
  } catch {
    return null;
  }
}

async function writeSqliteSettings(settings: NasSettings): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
    SETTINGS_META_KEY,
    JSON.stringify(settings),
  );
}

export async function loadNasSettings(): Promise<NasSettings> {
  const fromDb = await readSqliteSettings();
  if (fromDb) return fromDb;
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_NAS_SETTINGS };
    const parsed = hydrateSettings(JSON.parse(raw) as Partial<NasSettings>);
    try {
      await writeSqliteSettings(parsed);
    } catch {
      // Web memory DB still keeps the in-session copy via getDb.
    }
    return parsed;
  } catch {
    return { ...DEFAULT_NAS_SETTINGS };
  }
}

export async function saveNasSettings(settings: NasSettings): Promise<void> {
  const raw = JSON.stringify(settings);
  try {
    await writeSqliteSettings(settings);
  } catch {
    // Native SQLite is the source of truth; web falls back to AsyncStorage.
  }
  await AsyncStorage.setItem(SETTINGS_KEY, raw);
}

export async function loadNasPassword(): Promise<string> {
  try {
    return (await getSecret(PASSWORD_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveNasPassword(password: string): Promise<void> {
  if (!password) {
    await deleteSecret(PASSWORD_KEY);
    return;
  }
  await setSecret(PASSWORD_KEY, password);
}

export function nasBaseUrl(settings: NasSettings): string {
  const scheme = settings.useHttps ? "https" : "http";
  const host = settings.host.trim();
  const port = settings.port.trim();
  return `${scheme}://${host}:${port}`;
}

/** Same shape as music WebDAV, pointed at the video share. */
export function videoSourceSettings(settings: NasSettings): NasSettings {
  return {
    ...settings,
    host: settings.videoHost.trim() || settings.host,
    port: settings.videoPort.trim() || settings.port,
    username: settings.videoUsername.trim() || settings.username,
    sharePath: settings.videoSharePath.trim(),
    useHttps: settings.videoUseHttps,
  };
}

export function applyVideoSourceSettings(base: NasSettings, edited: NasSettings): NasSettings {
  return {
    ...base,
    videoHost: edited.host,
    videoPort: edited.port,
    videoUsername: edited.username,
    videoSharePath: edited.sharePath,
    videoUseHttps: edited.useHttps,
  };
}

/** Same server as music, pointed at the podcast folder. */
export function podcastSourceSettings(settings: NasSettings): NasSettings {
  return {
    ...settings,
    sharePath: settings.podcastSharePath.trim() || joinPath(settings.sharePath, "Podcasts"),
  };
}

export function applyPodcastSourceSettings(base: NasSettings, edited: NasSettings): NasSettings {
  return {
    ...base,
    host: edited.host,
    port: edited.port,
    username: edited.username,
    useHttps: edited.useHttps,
    podcastSharePath: edited.sharePath,
  };
}

/** Same server as music, pointed at the wealth folder (`nlc-wealth.json`). */
export function wealthSourceSettings(settings: NasSettings): NasSettings {
  return {
    ...settings,
    sharePath: settings.wealthSharePath.trim() || joinPath(settings.sharePath, "NLC"),
  };
}

export function applyWealthSourceSettings(base: NasSettings, edited: NasSettings): NasSettings {
  return {
    ...base,
    host: edited.host,
    port: edited.port,
    username: edited.username,
    useHttps: edited.useHttps,
    wealthSharePath: edited.sharePath,
  };
}

/** Same server as music, pointed at the tasks folder (`nlc-tasks.json`). */
export function focusSourceSettings(settings: NasSettings): NasSettings {
  return {
    ...settings,
    sharePath: settings.focusSharePath.trim() || joinPath(settings.sharePath, "NLC"),
  };
}

export function applyFocusSourceSettings(base: NasSettings, edited: NasSettings): NasSettings {
  return {
    ...base,
    host: edited.host,
    port: edited.port,
    username: edited.username,
    useHttps: edited.useHttps,
    focusSharePath: edited.sharePath,
  };
}
