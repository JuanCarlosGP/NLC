import { patchTrackRow, renameTrackTitle, retargetCatalogPath } from "@/lib/db/catalog";
import { getTrackArtworkUrl, rememberTrackArtwork } from "@/lib/library/artwork-cache";
import {
  LIBRARY_DIR,
  joinPath,
  sidecarCoverPath,
  toWebDavPath,
} from "@/lib/nas/webdav";
import {
  createDavTransport,
  deleteWebDavFile,
  moveWebDavPath,
  putWebDavBytes,
} from "@/lib/nas/webdav-source";
import { removeOfflineFile } from "@/lib/offline/downloader";
import { enqueueAudioReplace, getDownloadJob } from "@/lib/podcasts/downloader";
import type { DownloadSettings } from "@/lib/podcasts/download-settings";
import type { NasSettings } from "@/lib/settings/storage";
import { t } from "@/lib/i18n/runtime";

const COVER_EXTS = ["jpg", "jpeg", "png", "webp"] as const;
const MAX_AUDIO_BYTES = 120_000_000;
const MAX_COVER_BYTES = 8_000_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isYoutubeUrl(value: string): boolean {
  try {
    const host = new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, "");
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

function safeFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Keep the artist prefix and track number; only the title segment changes. */
export function renamedAudioPath(currentPath: string, title: string): string {
  const slash = currentPath.lastIndexOf("/");
  const dir = slash >= 0 ? currentPath.slice(0, slash) : "";
  const filename = slash >= 0 ? currentPath.slice(slash + 1) : currentPath;
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot) : "";
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  const numbered = stem.match(/^(\d{1,3}\s*[.\-_]\s*)(.+)$/);
  const prefix = numbered?.[1] ?? "";
  const rest = numbered?.[2] ?? stem;
  const split = rest.match(/^(.+?)\s+[-–—]\s+(.+)$/u);
  const nextTitle = safeFilePart(title);
  if (!nextTitle) throw new Error(t("player.nameEmpty"));
  const nextStem = split?.[1] ? `${prefix}${split[1].trim()} - ${nextTitle}` : `${prefix}${nextTitle}`;
  return dir ? `${dir}/${nextStem}${ext}` : `${nextStem}${ext}`;
}

function withExtension(path: string, ext: string): string {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot >= 0 ? path.slice(0, slash + 1 + dot) : path;
  return `${stem}${ext}`;
}

function audioMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "flac") return "audio/flac";
  if (ext === "m4a" || ext === "aac") return "audio/mp4";
  if (ext === "ogg" || ext === "opus") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  return "application/octet-stream";
}

async function relocateSidecar(
  settings: NasSettings,
  password: string,
  fromAudio: string,
  toAudio: string,
): Promise<string | null> {
  const { davFetch } = createDavTransport(settings, password);
  for (const ext of COVER_EXTS) {
    const from = sidecarCoverPath(fromAudio, ext);
    const to = sidecarCoverPath(toAudio, ext === "jpeg" ? "jpg" : ext);
    const head = await davFetch(from, { method: "HEAD" });
    let exists = head.ok;
    if (!exists && (head.status === 405 || head.status === 501)) {
      const probe = await davFetch(from, { method: "GET" });
      exists = probe.ok;
    }
    if (!exists) continue;
    if (from !== to) await moveWebDavPath(settings, password, from, to);
    return to;
  }
  return null;
}

export async function renameTrackFile(
  settings: NasSettings,
  password: string,
  trackId: string,
  title: string,
): Promise<string> {
  const next = renamedAudioPath(trackId, title);
  if (next === trackId) {
    await renameTrackTitle(trackId, title);
    return trackId;
  }
  await removeOfflineFile(trackId);
  await moveWebDavPath(settings, password, trackId, next);
  const cover = await relocateSidecar(settings, password, trackId, next);
  const art = getTrackArtworkUrl(trackId);
  await retargetCatalogPath(trackId, next);
  await renameTrackTitle(next, title.trim());
  if (cover) await patchTrackRow(next, { coverId: cover });
  if (art) await rememberTrackArtwork([{ trackId: next, url: art }]);
  return next;
}

export async function applyTrackCoverUrl(
  settings: NasSettings,
  password: string,
  trackId: string,
  imageUrl: string,
): Promise<void> {
  const image = await fetch(imageUrl.trim());
  if (!image.ok) throw new Error(t("player.coverBad"));
  const type = (image.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim();
  if (!type.startsWith("image/")) throw new Error(t("player.coverBad"));
  const bytes = await image.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_COVER_BYTES) throw new Error(t("player.coverBad"));
  const dest = sidecarCoverPath(trackId, "jpg");
  await putWebDavBytes(settings, password, dest, bytes, type);
  await rememberTrackArtwork([{ trackId, url: imageUrl.trim() }]);
  await patchTrackRow(trackId, { coverId: dest });
}

async function waitForAudioFile(
  settings: DownloadSettings,
  token: string,
  jobId: string,
): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 12 * 60 * 1000) {
    const job = await getDownloadJob(settings, token, jobId);
    if (job.status === "done") {
      const name = job.filename?.trim() ?? "";
      if (!name || /[\\/]/.test(name)) throw new Error(t("player.sourceFail"));
      return name;
    }
    if (job.status === "error") throw new Error(job.error?.trim() || t("player.sourceFail"));
    await wait(1500);
  }
  throw new Error(t("player.sourceFail"));
}

/** Replace the audio bytes of a NAS track. Title, artist and cover stay. */
export async function replaceTrackAudio(args: {
  trackId: string;
  youtubeUrl: string;
  nas: NasSettings;
  password: string;
  download: DownloadSettings;
  token: string;
}): Promise<string> {
  const { trackId, nas, password } = args;
  if (!trackId.startsWith("/")) throw new Error(t("player.sourceNotFile"));
  if (!isYoutubeUrl(args.youtubeUrl)) throw new Error(t("player.sourceBadUrl"));

  const queued = await enqueueAudioReplace(args.download, args.token, args.youtubeUrl);
  const filename = await waitForAudioFile(args.download, args.token, queued.id);
  const tempPath = joinPath(joinPath(toWebDavPath(nas.sharePath), LIBRARY_DIR.songs), filename);
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : ".mp3";
  const dest = withExtension(trackId, ext);

  const { davFetch } = createDavTransport(nas, password);
  const downloaded = await davFetch(tempPath, { method: "GET" });
  if (!downloaded.ok) throw new Error(t("player.sourceFail"));
  const bytes = await downloaded.arrayBuffer();

  try {
    if (!bytes.byteLength || bytes.byteLength > MAX_AUDIO_BYTES) throw new Error(t("player.sourceFail"));
    await removeOfflineFile(trackId);
    if (tempPath !== dest) {
      await putWebDavBytes(nas, password, dest, bytes, audioMime(filename));
    }
    const art = getTrackArtworkUrl(trackId);
    if (dest !== trackId) {
      const cover = await relocateSidecar(nas, password, trackId, dest);
      await deleteWebDavFile(nas, password, trackId);
      await retargetCatalogPath(trackId, dest);
      await patchTrackRow(dest, {
        contentType: audioMime(filename),
        ...(cover ? { coverId: cover } : {}),
      });
      if (art) await rememberTrackArtwork([{ trackId: dest, url: art }]);
    }
    return dest;
  } finally {
    if (tempPath !== dest) {
      await deleteWebDavFile(nas, password, tempPath).catch(() => undefined);
      for (const sideExt of COVER_EXTS) {
        const side = sidecarCoverPath(tempPath, sideExt);
        if (side !== sidecarCoverPath(dest, sideExt)) {
          await deleteWebDavFile(nas, password, side).catch(() => undefined);
        }
      }
    }
  }
}
