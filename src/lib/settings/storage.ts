import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDb } from "@/lib/db/client";
import type { MusicSourceKind } from "@/lib/nas/types";
import { joinPath, siblingOfShare, LIBRARY_DIR } from "@/lib/nas/webdav";
import { deleteSecret, getSecret, setSecret } from "@/lib/settings/secret-store";

const SETTINGS_KEY = "nlc.settings.v1";
const SETTINGS_META_KEY = "nas_settings";
const PASSWORD_KEY = "nlc.nas.password";
const ONBOARDING_KEY = "nlc.onboarding.v1";
const ONBOARDING_META_KEY = "onboarding_v1";

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

/** First launch / skip: no factory NAS credentials in memory or storage. */
export const UNSET_NAS_SETTINGS: NasSettings = {
  ...DEFAULT_NAS_SETTINGS,
  host: "",
  username: "",
  videoHost: "",
  videoUsername: "",
};

function sameTrim(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

export function looksLikeFactoryNas(settings: NasSettings): boolean {
  const host = settings.host.trim();
  const user = settings.username.trim();
  const videoHost = settings.videoHost.trim();
  const videoUser = settings.videoUsername.trim();
  const factoryHost = !host || sameTrim(host, DEFAULT_NAS_SETTINGS.host);
  const factoryUser = !user || sameTrim(user, DEFAULT_NAS_SETTINGS.username);
  const factoryVideoHost = !videoHost || sameTrim(videoHost, DEFAULT_NAS_SETTINGS.videoHost);
  const factoryVideoUser = !videoUser || sameTrim(videoUser, DEFAULT_NAS_SETTINGS.videoUsername);
  return factoryHost && factoryUser && factoryVideoHost && factoryVideoUser;
}

/** Soft migration: real setup, not the empty-host heuristic (defaults are never empty). */
export function isClearlyConfiguredNas(settings: NasSettings, password: string): boolean {
  if (password.trim()) return true;
  if (
    settings.localFolderUri.trim() ||
    settings.podcastLocalFolderUri.trim() ||
    settings.videoLocalFolderUri.trim() ||
    settings.wealthLocalFolderUri.trim() ||
    settings.focusLocalFolderUri.trim()
  ) {
    return true;
  }
  if (settings.sourceKind !== "webdav") return true;
  const host = settings.host.trim();
  const user = settings.username.trim();
  const videoHost = settings.videoHost.trim();
  const videoUser = settings.videoUsername.trim();
  if (host && !sameTrim(host, DEFAULT_NAS_SETTINGS.host)) return true;
  if (user && !sameTrim(user, DEFAULT_NAS_SETTINGS.username)) return true;
  if (videoHost && !sameTrim(videoHost, DEFAULT_NAS_SETTINGS.videoHost) && !sameTrim(videoHost, host)) return true;
  if (videoUser && !sameTrim(videoUser, DEFAULT_NAS_SETTINGS.videoUsername) && !sameTrim(videoUser, user)) {
    return true;
  }
  if (settings.port.trim() && settings.port.trim() !== DEFAULT_NAS_SETTINGS.port && settings.port.trim() !== "4533") {
    return true;
  }
  if (settings.sharePath.trim() && settings.sharePath.trim() !== DEFAULT_NAS_SETTINGS.sharePath) return true;
  return false;
}

function asNasFolderPath(path: string | undefined, fallback: string): string {
  if (path === undefined) return fallback;
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (trimmed === "/Documents/NLC" || trimmed === "/volume1/Documents/NLC") {
    return "/Music/NLC";
  }
  return trimmed;
}

function hydrateSettings(parsed: Partial<NasSettings>): NasSettings {
  const next = { ...DEFAULT_NAS_SETTINGS, ...parsed };
  const picked = (key: "sharePath" | "podcastSharePath" | "videoSharePath" | "wealthSharePath" | "focusSharePath", fallback: string): string =>
    asNasFolderPath(
      Object.prototype.hasOwnProperty.call(parsed, key) ? parsed[key] : next[key],
      fallback,
    );
  next.sharePath = picked("sharePath", "/volume1/Music");
  next.podcastSharePath = picked("podcastSharePath", joinPath(next.sharePath, "Podcasts"));
  next.videoSharePath = picked("videoSharePath", "/volume1/Popcorn");
  next.wealthSharePath = picked("wealthSharePath", joinPath(next.sharePath, "NLC") || "/volume1/Music/NLC");
  next.focusSharePath = picked("focusSharePath", joinPath(next.sharePath, "NLC") || "/volume1/Music/NLC");
  if (!Object.prototype.hasOwnProperty.call(parsed, "podcastSharePath") && !next.podcastSharePath.trim()) {
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
    if (!raw) return { ...UNSET_NAS_SETTINGS };
    const parsed = hydrateSettings(JSON.parse(raw) as Partial<NasSettings>);
    try {
      await writeSqliteSettings(parsed);
    } catch {
      // Web memory DB still keeps the in-session copy via getDb.
    }
    return parsed;
  } catch {
    return { ...UNSET_NAS_SETTINGS };
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

function isOnboardingFlag(value: string | null | undefined): boolean {
  return value === "1" || value === "true";
}

async function readSqliteOnboarding(): Promise<boolean | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = ?",
      ONBOARDING_META_KEY,
    );
    if (!row?.value) return null;
    return isOnboardingFlag(row.value);
  } catch {
    return null;
  }
}

async function writeSqliteOnboarding(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
    ONBOARDING_META_KEY,
    "1",
  );
}

export async function loadOnboardingComplete(): Promise<boolean> {
  const fromDb = await readSqliteOnboarding();
  if (fromDb) return true;
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (!isOnboardingFlag(raw)) return false;
    try {
      await writeSqliteOnboarding();
    } catch {
      // Web memory DB still keeps the in-session copy via getDb.
    }
    return true;
  } catch {
    return false;
  }
}

export async function saveOnboardingComplete(): Promise<void> {
  try {
    await writeSqliteOnboarding();
  } catch {
    // Native SQLite is the source of truth; web falls back to AsyncStorage.
  }
  await AsyncStorage.setItem(ONBOARDING_KEY, "1");
}

export async function clearOnboardingComplete(): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync("DELETE FROM meta WHERE key = ?", ONBOARDING_META_KEY);
  } catch {
    // Native SQLite is the source of truth; web falls back to AsyncStorage.
  }
  await AsyncStorage.removeItem(ONBOARDING_KEY);
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
    sharePath: settings.podcastSharePath.trim() || siblingOfShare(settings.sharePath, LIBRARY_DIR.podcasts),
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
    sharePath: settings.wealthSharePath.trim() || siblingOfShare(settings.sharePath, LIBRARY_DIR.wealth),
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
    sharePath: settings.focusSharePath.trim() || siblingOfShare(settings.sharePath, LIBRARY_DIR.wealth),
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
