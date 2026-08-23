export type YoutubeMusicKind = "playlist" | "album" | "track" | "radio";

export type ParsedYoutubeMusicUrl = {
  kind: YoutubeMusicKind;
  playlistId?: string;
  videoId?: string;
  browseId?: string;
};

const YT_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

function hostOf(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

export function parseYoutubeMusicUrl(input: string): ParsedYoutubeMusicUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!YT_HOSTS.has(hostOf(url.hostname))) return null;

  const list = url.searchParams.get("list")?.trim() || undefined;
  let video = url.searchParams.get("v")?.trim() || undefined;
  if (hostOf(url.hostname) === "youtu.be") {
    video = url.pathname.replace(/^\//, "").split("/")[0] || video;
  }

  const browse = url.pathname.match(/\/browse\/([A-Za-z0-9_-]+)/)?.[1];

  if (list) {
    const kind: YoutubeMusicKind = list.startsWith("RD") ? "radio" : list.startsWith("OLAK") ? "album" : "playlist";
    return { kind, playlistId: list, videoId: video };
  }
  if (browse) {
    return {
      kind: browse.startsWith("MPRE") ? "album" : "playlist",
      browseId: browse,
    };
  }
  if (video) return { kind: "track", videoId: video };
  return null;
}

export function youtubeMusicCanonicalUrl(ref: ParsedYoutubeMusicUrl): string {
  if (ref.playlistId && ref.videoId) {
    return `https://music.youtube.com/watch?v=${ref.videoId}&list=${ref.playlistId}`;
  }
  if (ref.playlistId) return `https://music.youtube.com/playlist?list=${ref.playlistId}`;
  if (ref.videoId) return `https://music.youtube.com/watch?v=${ref.videoId}`;
  if (ref.browseId) return `https://music.youtube.com/browse/${ref.browseId}`;
  return "https://music.youtube.com";
}

export function youtubeMusicEntityId(ref: ParsedYoutubeMusicUrl): string {
  return `ytm-${ref.playlistId || ref.browseId || ref.videoId || "mix"}`;
}
