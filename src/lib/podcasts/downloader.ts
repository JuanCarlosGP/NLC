import {
  downloadBaseUrl,
  type DownloadSettings,
} from "@/lib/podcasts/download-settings";
import { t } from "@/lib/i18n/runtime";

export type DownloadJobStatus = "queued" | "running" | "done" | "error";
export type DownloadMediaKind = "podcast" | "song" | "video" | "auto";
export type DownloadResolvedKind = "podcast" | "song" | "video";

export type DownloadJob = {
  id: string;
  status: DownloadJobStatus;
  url: string;
  kind?: DownloadMediaKind | null;
  resolvedKind?: DownloadResolvedKind | null;
  title?: string | null;
  filename?: string | null;
  error?: string | null;
  progress?: number | null;
  speed?: string | null;
  eta?: string | null;
  log?: string[] | null;
};

export type DownloadHealth = {
  ok: boolean;
  podcastDir?: string;
  songDir?: string;
  videoDir?: string;
  downloadDir?: string;
  ytDlp?: string;
};

function authHeaders(token: string): Record<string, string> {
  const trimmed = token.trim();
  if (!trimmed) return {};
  return {
    "X-Download-Token": trimmed,
    Authorization: `Bearer ${trimmed}`,
  };
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      detail?: string | { msg?: string; loc?: (string | number)[]; type?: string }[];
    };
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail) && data.detail.length) {
      const first = data.detail[0]!;
      const loc = Array.isArray(first.loc) ? first.loc.filter((p) => p !== "body").join(".") : "";
      const msg = first.msg || t("feedback.validationError");
      // Old downloader only accepted `url` — new app sends `query` (+ duration).
      if (/field required/i.test(msg) && (!loc || loc === "url")) {
        return t("feedback.downloaderOutdated");
      }
      return loc ? `${loc}: ${msg}` : msg;
    }
  } catch {
    // ignore
  }
  return t("feedback.httpError", { status: response.status });
}

function networkError(err: unknown, base: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|network request failed|load failed|fetch/i.test(msg)) {
    return new Error(t("feedback.networkNoResponse", { base }));
  }
  return err instanceof Error ? err : new Error(msg);
}

async function downloaderFetch(
  settings: DownloadSettings,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = downloadBaseUrl(settings);
  try {
    return await fetch(`${base}${path}`, init);
  } catch (err) {
    throw networkError(err, base);
  }
}

export async function checkDownloaderHealth(
  settings: DownloadSettings,
  token: string,
): Promise<DownloadHealth> {
  const response = await downloaderFetch(settings, "/health", {
    method: "GET",
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DownloadHealth;
}

export async function enqueueDownload(
  settings: DownloadSettings,
  token: string,
  url: string,
  kind: DownloadMediaKind = "song",
): Promise<{ id: string; status: DownloadJobStatus }> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error(t("feedback.pasteUrl"));
  if (/open\.spotify\.com|spotify:/i.test(trimmed)) {
    throw new Error(t("feedback.spotifyNoDownload"));
  }

  const response = await downloaderFetch(settings, "/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ url: trimmed, kind }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { id: string; status: DownloadJobStatus };
}

/** Build yt-dlp search text: "Title - Artist". */
export function downloadSearchQuery(title: string, artistName: string): string {
  const track = title.trim();
  const artist = (artistName.split(",")[0] ?? artistName).trim();
  if (track && artist) return `${track} - ${artist}`;
  return track || artist || "audio";
}

export async function enqueueSearchDownload(
  settings: DownloadSettings,
  token: string,
  query: string,
  kind: DownloadMediaKind = "song",
  durationMs?: number | null,
): Promise<{ id: string; status: DownloadJobStatus }> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error(t("feedback.missingTitleArtist"));

  const payload: { query: string; kind: DownloadMediaKind; durationMs?: number } = {
    query: trimmed,
    kind,
  };
  if (typeof durationMs === "number" && durationMs > 0) {
    payload.durationMs = Math.round(durationMs);
  }

  const response = await downloaderFetch(settings, "/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { id: string; status: DownloadJobStatus };
}

export async function getDownloadJob(
  settings: DownloadSettings,
  token: string,
  jobId: string,
): Promise<DownloadJob> {
  const response = await downloaderFetch(settings, `/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DownloadJob;
}

export async function waitForDownloadJob(
  settings: DownloadSettings,
  token: string,
  jobId: string,
  onUpdate?: (job: DownloadJob) => void,
): Promise<DownloadJob> {
  const started = Date.now();
  let current = await getDownloadJob(settings, token, jobId);
  onUpdate?.(current);
  while (current.status === "queued" || current.status === "running") {
    if (Date.now() - started > 15 * 60 * 1000) {
      throw new Error(t("feedback.downloadSlow"));
    }
    await new Promise((r) => setTimeout(r, 1500));
    current = await getDownloadJob(settings, token, jobId);
    onUpdate?.(current);
  }
  return current;
}

export function jobStatusLabel(status: DownloadJobStatus): string {
  if (status === "queued") return t("downloadSheet.jobQueued");
  if (status === "running") return t("downloadSheet.jobRunning");
  if (status === "done") return t("downloadSheet.jobDone");
  return t("downloadSheet.jobError");
}
