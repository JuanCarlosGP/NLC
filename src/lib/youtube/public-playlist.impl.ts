import { t } from "@/lib/i18n/runtime";
import { Platform } from "react-native";
import type { ImportedPlaylist } from "@/lib/spotify/types";
import { fetchYoutubeMusicEntity } from "@/lib/youtube/innertube";
import { parseYoutubeMusicUrl, type ParsedYoutubeMusicUrl } from "@/lib/youtube/parse-url";

function asNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /failed to fetch|network request failed|load failed|network/i.test(message);
}

async function fetchViaLocalApi(url: string): Promise<Omit<ImportedPlaylist, "importedAt">> {
  let response: Response;
  try {
    response = await fetch(`/api/spotify-embed?yt=${encodeURIComponent(url)}`, {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    if (asNetworkError(err)) {
      throw new Error(t("nasExtra.youtubeNoServer"));
    }
    throw err instanceof Error ? err : new Error(t("nasExtra.youtubeReadFail"));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(t("nasExtra.youtubeBadResponse"));
  }

  const payload = (await response.json()) as Omit<ImportedPlaylist, "importedAt"> & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || t("nasExtra.youtubeReadFail"));
  }
  if (!Array.isArray(payload.tracks) || !payload.tracks.length) {
    throw new Error(t("nasExtra.youtubeEmpty"));
  }
  return payload;
}

export async function fetchPublicYoutubeMusic(
  url: string,
  parsed?: ParsedYoutubeMusicUrl | null,
): Promise<Omit<ImportedPlaylist, "importedAt">> {
  const ref = parsed ?? parseYoutubeMusicUrl(url);
  if (!ref) {
    throw new Error(t("nasExtra.youtubeInvalidUrl"));
  }

  if (Platform.OS === "web") {
    return fetchViaLocalApi(url);
  }

  return fetchYoutubeMusicEntity(ref);
}
