import { t } from "@/lib/i18n/runtime";

export type SpotifyEntityKind = "playlist" | "album" | "track";

export type ParsedSpotifyUrl = {
  kind: SpotifyEntityKind;
  id: string;
};

const KINDS = new Set<string>(["playlist", "album", "track"]);

export function parseSpotifyUrl(input: string): ParsedSpotifyUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const path = trimmed.match(
    /(?:open\.spotify\.com\/(?:embed\/|intl-[a-z]{2}\/)?)?(playlist|album|track)\/([a-zA-Z0-9]{22})/i,
  );
  if (path?.[1] && path[2] && KINDS.has(path[1].toLowerCase())) {
    return { kind: path[1].toLowerCase() as SpotifyEntityKind, id: path[2] };
  }

  const uri = trimmed.match(/^spotify:(playlist|album|track):([a-zA-Z0-9]{22})$/i);
  if (uri?.[1] && uri[2] && KINDS.has(uri[1].toLowerCase())) {
    return { kind: uri[1].toLowerCase() as SpotifyEntityKind, id: uri[2] };
  }

  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return { kind: "playlist", id: trimmed };
  return null;
}

export function spotifyOpenUrl(kind: SpotifyEntityKind, id: string): string {
  return `https://open.spotify.com/${kind}/${id}`;
}

export function spotifyEmbedUrl(kind: SpotifyEntityKind, id: string): string {
  return `https://open.spotify.com/embed/${kind}/${id}`;
}

export function kindLabel(kind: SpotifyEntityKind | undefined): string {
  if (kind === "album") return t("playlistActions.album");
  if (kind === "track") return t("nasExtra.unknownTrack");
  return t("playlistActions.playlist");
}
