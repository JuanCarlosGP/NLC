import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isRunningInExpoGo } from "expo";
import * as Notifications from "expo-notifications";
import {
  addDownloadWatchFinishedListener,
  startNativeDownloadWatch,
  stopNativeDownloadWatch,
} from "nlc-lan-bridge";
import { t } from "@/lib/i18n/runtime";
import { DOWNLOAD_PROGRESS_KIND } from "@/lib/podcasts/download-progress-kind";
import {
  listDownloadJobs,
  type DownloadJob,
} from "@/lib/podcasts/downloader";
import { downloadBaseUrl, type DownloadSettings } from "@/lib/podcasts/download-settings";

const CHANNEL = "downloads";
const NOTIF_ID = "nlc-nas-downloads";
const STORE_KEY = "nlc.downloads.watch.v1";
const POLL_MS = 2_500;
const MAX_WATCH_MS = 4 * 60 * 60 * 1000;
export { DOWNLOAD_PROGRESS_KIND };

type WatchState = {
  ids: string[];
  host: string;
  port: string;
  startedAt: number;
};

let watching = new Set<string>();
let settingsRef: DownloadSettings | null = null;
let tokenRef = "";
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let startedAt = 0;
let lastBody = "";
let permission: boolean | null = null;
let nativeWatching = false;
let nativeFinishedSub: { remove(): void } | null = null;
let appStateSub: { remove(): void } | null = null;

function stopTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

function ensureListeners(): void {
  if (!appStateSub) {
    appStateSub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !watching.size) return;
      void tick();
    });
  }
  if (!nativeFinishedSub) {
    nativeFinishedSub = addDownloadWatchFinishedListener((event) => {
      if (!watching.size) return;
      void finishWatch(event.done ?? 0, event.failed ?? 0);
    });
  }
}

function watchParams(): Record<string, string> {
  return {
    baseUrl: settingsRef ? downloadBaseUrl(settingsRef) : "",
    token: tokenRef,
    ids: [...watching].join(","),
    title: t("downloadProgress.title"),
    titleDone: t("downloadProgress.titleDone"),
    body: t("downloadProgress.body"),
    bodyQueued: t("downloadProgress.bodyQueued"),
    bodyDone: t("downloadProgress.bodyDone"),
    bodyDoneAll: t("downloadProgress.bodyDoneAll"),
    bodyTimeout: t("downloadProgress.bodyTimeout"),
    currentPct: t("downloadProgress.currentPct"),
    trackFallback: t("downloadProgress.trackFallback"),
  };
}

async function loadState(): Promise<WatchState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WatchState>;
    if (!Array.isArray(parsed.ids) || !parsed.ids.length) return null;
    return {
      ids: parsed.ids.filter((id): id is string => typeof id === "string" && Boolean(id)),
      host: parsed.host || "",
      port: parsed.port || "",
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

async function saveState(): Promise<void> {
  if (!watching.size || !settingsRef) {
    await AsyncStorage.removeItem(STORE_KEY);
    return;
  }
  const next: WatchState = {
    ids: [...watching],
    host: settingsRef.host,
    port: settingsRef.port,
    startedAt,
  };
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === "web" || isRunningInExpoGo()) return false;
  if (permission != null) return permission;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: t("downloadProgress.channel"),
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#E4D5B8",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") {
    permission = true;
    return true;
  }
  const asked = await Notifications.requestPermissionsAsync();
  permission = asked.status === "granted";
  return permission;
}

function jobLabel(job: DownloadJob): string {
  const title = (job.title || "").trim();
  if (title && title.toLowerCase() !== "null") return title;
  const url = (job.url || "").trim();
  if (url && url.toLowerCase() !== "null") return url;
  return t("downloadProgress.trackFallback");
}

export type DownloadWatchSummary = {
  done: number;
  failed: number;
  finished: boolean;
};

type FinishedHandler = (summary: DownloadWatchSummary) => void;

let finishedHandler: FinishedHandler | null = null;

function summarize(ids: string[], jobs: DownloadJob[]): {
  done: number;
  failed: number;
  running: DownloadJob | null;
  remaining: number;
  body: string;
  finished: boolean;
} {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  let done = 0;
  let failed = 0;
  let running: DownloadJob | null = null;
  for (const id of ids) {
    const job = byId.get(id);
    // A missed poll is not a failure — the NAS job may still be searching.
    if (!job) continue;
    if (job.status === "done") done += 1;
    else if (job.status === "error") failed += 1;
    else if ((job.status === "running" || job.status === "queued") && !running) running = job;
  }
  const total = ids.length;
  const remaining = total - done - failed;
  const finished = remaining <= 0;
  let current = "";
  if (running) {
    const pct = running.progress != null ? Math.round(running.progress) : null;
    current = pct != null
      ? t("downloadProgress.currentPct", { title: jobLabel(running), pct })
      : jobLabel(running);
  }
  const body = finished
    ? failed
      ? t("downloadProgress.bodyDone", { done, failed })
      : t("downloadProgress.bodyDoneAll", { done })
    : current
      ? t("downloadProgress.body", { done, total, current })
      : t("downloadProgress.bodyQueued", { done, total });
  return { done, failed, running, remaining, body, finished };
}

async function present(body: string, finished: boolean): Promise<void> {
  if (nativeWatching) return;
  if (body === lastBody && !finished) return;
  lastBody = body;
  const allowed = await ensurePermission();
  if (!allowed) return;
  const content: Notifications.NotificationContentInput = {
    title: finished ? t("downloadProgress.titleDone") : t("downloadProgress.title"),
    body,
    sound: finished,
    sticky: !finished,
    autoDismiss: finished,
    color: "#E4D5B8",
    data: { kind: DOWNLOAD_PROGRESS_KIND, finished },
  };
  if (Platform.OS === "android") {
    (content as Notifications.NotificationContentInput & { channelId?: string }).channelId = CHANNEL;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID,
    content,
    trigger: null,
  });
}

async function tick(): Promise<void> {
  if (inFlight || !settingsRef || !watching.size) return;
  if (Date.now() - startedAt > MAX_WATCH_MS) {
    if (nativeWatching) return;
    await present(t("downloadProgress.bodyTimeout"), true);
    await finishWatch(0, 0);
    return;
  }
  inFlight = true;
  try {
    const ids = [...watching];
    const jobs = await listDownloadJobs(settingsRef, tokenRef, ids);
    const summary = summarize(ids, jobs);
    try {
      await present(summary.body, summary.finished);
    } catch {
      // Notification delivery is best-effort.
    }
    if (summary.finished) {
      await finishWatch(summary.done, summary.failed);
      return;
    }
  } catch {
    // Keep the last notification; retry on the next tick.
  } finally {
    inFlight = false;
    if (watching.size && !nativeWatching) {
      stopTimer();
      timer = setTimeout(() => {
        void tick();
      }, POLL_MS);
    }
  }
}

async function finishWatch(done: number, failed: number): Promise<void> {
  if (!watching.size) return;
  watching.clear();
  startedAt = 0;
  stopTimer();
  nativeWatching = false;
  await stopNativeDownloadWatch();
  await saveState();
  const notify = finishedHandler;
  finishedHandler = null;
  notify?.({ done, failed, finished: true });
}

function arm(): void {
  if (!watching.size) return;
  if (!startedAt) startedAt = Date.now();
  ensureListeners();
  void saveState();
  void (async () => {
    nativeWatching = await startNativeDownloadWatch(watchParams());
    if (nativeWatching) {
      stopTimer();
      try {
        await Notifications.dismissNotificationAsync(NOTIF_ID);
      } catch {
        // Old sessions may not have a JS notification.
      }
    }
    void tick();
  })();
}

export async function watchNasDownloads(
  settings: DownloadSettings,
  token: string,
  jobIds: string[],
  onFinished?: FinishedHandler,
): Promise<void> {
  if (Platform.OS === "web" || isRunningInExpoGo()) return;
  const ids = jobIds.filter(Boolean);
  if (!ids.length) return;
  const wasIdle = watching.size === 0;
  settingsRef = settings;
  tokenRef = token;
  if (onFinished) finishedHandler = onFinished;
  for (const id of ids) watching.add(id);
  lastBody = "";
  if (wasIdle || !startedAt) startedAt = Date.now();
  arm();
}

export async function resumeNasDownloadWatch(
  settings: DownloadSettings,
  token: string,
): Promise<void> {
  if (Platform.OS === "web" || isRunningInExpoGo()) return;
  const stored = await loadState();
  if (!stored?.ids.length) return;
  settingsRef = settings;
  tokenRef = token;
  watching = new Set(stored.ids);
  startedAt = stored.startedAt || Date.now();
  lastBody = "";
  arm();
}

export function isDownloadProgressNotification(data: Record<string, unknown> | undefined): boolean {
  return data?.kind === DOWNLOAD_PROGRESS_KIND;
}
