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

export type SearchDownloadItem = {
  query: string;
  kind?: DownloadMediaKind;
  durationMs?: number | null;
};

type EnqueuedJob = { id: string; status: DownloadJobStatus };

function searchDownloadPayload(item: SearchDownloadItem): {
  query: string;
  kind: DownloadMediaKind;
  durationMs?: number;
} {
  const trimmed = item.query.trim();
  if (!trimmed) throw new Error(t("feedback.missingTitleArtist"));
  const payload: { query: string; kind: DownloadMediaKind; durationMs?: number } = {
    query: trimmed,
    kind: item.kind ?? "song",
  };
  if (typeof item.durationMs === "number" && item.durationMs > 0) {
    payload.durationMs = Math.round(item.durationMs);
  }
  return payload;
}

export async function enqueueSearchDownload(
  settings: DownloadSettings,
  token: string,
  query: string,
  kind: DownloadMediaKind = "song",
  durationMs?: number | null,
): Promise<EnqueuedJob> {
  const payload = searchDownloadPayload({ query, kind, durationMs });
  const response = await downloaderFetch(settings, "/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as EnqueuedJob;
}

/** Queue many searches on the NAS and return immediately. Jobs keep running if the app leaves. */
export async function enqueueSearchDownloads(
  settings: DownloadSettings,
  token: string,
  items: SearchDownloadItem[],
): Promise<EnqueuedJob[]> {
  if (!items.length) return [];
  const payload = items.map((item) => searchDownloadPayload(item));
  const headers = {
    "Content-Type": "application/json",
    ...authHeaders(token),
  };
  const batch = await downloaderFetch(settings, "/download/batch", {
    method: "POST",
    headers,
    body: JSON.stringify({ items: payload }),
  });
  if (batch.ok) {
    const body = (await batch.json()) as { jobs?: EnqueuedJob[] };
    if (Array.isArray(body.jobs) && body.jobs.length) return body.jobs;
  }
  if (batch.status !== 404 && batch.status !== 405) {
    throw new Error(await readError(batch));
  }
  const jobs: EnqueuedJob[] = [];
  for (const item of payload) {
    const response = await downloaderFetch(settings, "/download", {
      method: "POST",
      headers,
      body: JSON.stringify(item),
    });
    if (!response.ok) throw new Error(await readError(response));
    jobs.push((await response.json()) as EnqueuedJob);
  }
  return jobs;
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

export async function listDownloadJobs(
  settings: DownloadSettings,
  token: string,
  ids: string[],
): Promise<DownloadJob[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids.filter(Boolean))];
  const headers = authHeaders(token);
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 80) {
    chunks.push(unique.slice(i, i + 80));
  }
  const collected: DownloadJob[] = [];
  let useFallback = false;
  for (const chunk of chunks) {
    const query = chunk.map((id) => encodeURIComponent(id)).join(",");
    const listed = await downloaderFetch(settings, `/jobs?ids=${query}`, {
      method: "GET",
      headers,
    });
    if (listed.ok) {
      const body = (await listed.json()) as { jobs?: DownloadJob[] };
      if (Array.isArray(body.jobs)) {
        collected.push(...body.jobs);
        continue;
      }
    }
    if (listed.status !== 404 && listed.status !== 405 && listed.ok === false) {
      throw new Error(await readError(listed));
    }
    useFallback = true;
    break;
  }
  if (!useFallback) return collected;
  const jobs: DownloadJob[] = [];
  const sliceSize = 6;
  for (let i = 0; i < unique.length; i += sliceSize) {
    const slice = unique.slice(i, i + sliceSize);
    const part = await Promise.all(
      slice.map(async (id) => {
        try {
          return await getDownloadJob(settings, token, id);
        } catch {
          return null;
        }
      }),
    );
    for (const job of part) {
      if (job) jobs.push(job);
    }
  }
  return jobs;
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
