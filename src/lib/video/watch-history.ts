import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "nlc.video.watch.v2";
const LEGACY_KEY = "nlc.video.watch.v1";
const MAX_SERIES = 12;

export type VideoWatchEntry = {
  seriesId: string;
  seriesTitle: string;
  path: string;
  arcPath: string;
  sagaPath: string;
  number: number;
  title: string;
  arcTitle: string;
  sagaTitle: string;
  positionSec: number;
  durationSec: number;
  watchedAt: number;
};

let memory: VideoWatchEntry[] = [];
let activePath: string | null = null;
let loaded = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function isEntry(value: unknown): value is VideoWatchEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as VideoWatchEntry;
  return Boolean(row.path && row.seriesId);
}

function seriesKey(entry: Pick<VideoWatchEntry, "seriesId" | "path">): string {
  return (entry.seriesId || entry.path).toLowerCase();
}

export function watchMatchesPath(entry: VideoWatchEntry, match: string): boolean {
  return (
    entry.path === match ||
    entry.arcPath === match ||
    entry.sagaPath === match ||
    entry.path.startsWith(`${match}/`)
  );
}

export function isWatchFinished(entry: VideoWatchEntry): boolean {
  return entry.durationSec > 20 && entry.positionSec / entry.durationSec >= 0.92;
}

export function peekWatchHistory(): VideoWatchEntry[] {
  return memory;
}

export function peekLastWatch(): VideoWatchEntry | null {
  return memory[0] ?? null;
}

export function peekWatchForPath(path: string): VideoWatchEntry | null {
  return memory.find((entry) => entry.path === path) ?? null;
}

export async function loadWatchHistory(): Promise<VideoWatchEntry[]> {
  if (loaded) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      memory = Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } else {
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      const parsed = legacy ? (JSON.parse(legacy) as unknown) : null;
      memory = isEntry(parsed) ? [parsed] : [];
      if (memory.length) await persistAll();
    }
  } catch {
    memory = [];
  }
  loaded = true;
  return memory;
}

export async function loadLastWatch(): Promise<VideoWatchEntry | null> {
  const rows = await loadWatchHistory();
  return rows[0] ?? null;
}

async function persistAll() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Keep in-memory history even if storage is unavailable.
  }
}

function schedulePersist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void persistAll();
  }, 4000);
}

function upsert(entry: VideoWatchEntry) {
  const key = seriesKey(entry);
  memory = [entry, ...memory.filter((item) => seriesKey(item) !== key)].slice(0, MAX_SERIES);
}

export async function markWatching(entry: Omit<VideoWatchEntry, "watchedAt">): Promise<VideoWatchEntry> {
  await loadWatchHistory();
  const previous = memory.find((item) => seriesKey(item) === seriesKey(entry));
  const samePath = previous?.path === entry.path ? previous : null;
  const next: VideoWatchEntry = {
    ...entry,
    positionSec: entry.positionSec || samePath?.positionSec || 0,
    durationSec: entry.durationSec || samePath?.durationSec || 0,
    watchedAt: Date.now(),
  };
  activePath = next.path;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  upsert(next);
  await persistAll();
  return next;
}

export function updateWatchProgress(positionSec: number, durationSec: number) {
  const index = memory.findIndex((item) => item.path === (activePath || item.path));
  const current = index >= 0 ? memory[index] : memory[0];
  if (!current || (activePath && current.path !== activePath)) return;
  const next = {
    ...current,
    positionSec: Math.max(0, positionSec),
    durationSec: Math.max(current.durationSec, durationSec),
    watchedAt: Date.now(),
  };
  upsert(next);
  schedulePersist();
}

export async function clearLastWatch(match?: string): Promise<void> {
  await loadWatchHistory();
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!match) {
    memory = [];
    activePath = null;
  } else {
    memory = memory.filter((entry) => !watchMatchesPath(entry, match));
    if (activePath && !memory.some((entry) => entry.path === activePath)) activePath = null;
  }
  try {
    await persistAll();
    if (!memory.length) await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export async function flushWatchProgress(positionSec?: number, durationSec?: number, path?: string) {
  await loadWatchHistory();
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  const target = path || activePath;
  const current = target ? memory.find((item) => item.path === target) : memory[0];
  if (!current) return;
  upsert({
    ...current,
    positionSec: positionSec ?? current.positionSec,
    durationSec: durationSec ?? current.durationSec,
    watchedAt: Date.now(),
  });
  await persistAll();
}
