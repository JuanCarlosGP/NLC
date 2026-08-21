import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  hydrateTrackArtworkCache,
  syncArtworkFromPlaylists,
} from "@/lib/library/artwork-cache";
import { matchImportedTracks } from "@/lib/spotify/match";
import { parseSpotifyUrl } from "@/lib/spotify/parse-url";
import { fetchPublicSpotifyEntity } from "@/lib/spotify/public-playlist";
import {
  loadImportedPlaylists,
  removeImportedPlaylist,
  toggleImportedPlaylistLiked,
  upsertImportedPlaylist,
} from "@/lib/spotify/playlist-store";
import { useSettings } from "@/lib/settings/settings-context";
import { applyCoverMap, loadTrackCoverMap, playlistNeedsCovers, trackNeedsCover } from "@/lib/spotify/track-covers";
import type { ImportedPlaylist } from "@/lib/spotify/types";

type SpotifyContextValue = {
  playlists: ImportedPlaylist[];
  importPlaylistUrl: (url: string) => Promise<ImportedPlaylist>;
  hydratePlaylistCovers: (playlist: ImportedPlaylist) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  togglePlaylistLiked: (id: string) => Promise<void>;
  rematchPlaylist: (id: string) => Promise<void>;
};

const SpotifyContext = createContext<SpotifyContextValue | null>(null);

function withKind(playlist: ImportedPlaylist): ImportedPlaylist {
  return { ...playlist, kind: playlist.kind ?? "playlist" };
}

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const { source } = useSettings();
  const [playlists, setPlaylists] = useState<ImportedPlaylist[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateTrackArtworkCache();
      const stored = await loadImportedPlaylists();
      if (cancelled) return;
      setPlaylists(stored.map(withKind));
      void syncArtworkFromPlaylists(stored);
    })().catch(() => {
      if (!cancelled) setPlaylists([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const importPlaylistUrl = useCallback(
    async (url: string) => {
      const parsed = parseSpotifyUrl(url);
      if (!parsed) {
        throw new Error("Pega un enlace de playlist, álbum o canción de Spotify.");
      }
      const publicEntity = await fetchPublicSpotifyEntity(parsed.kind, parsed.id);
      const playlist: ImportedPlaylist = {
        ...publicEntity,
        importedAt: Date.now(),
      };
      const next = await upsertImportedPlaylist(playlist);
      setPlaylists(next.map(withKind));
      void matchImportedTracks(source, playlist.tracks)
        .then(async (tracks) => {
          const updated = { ...playlist, tracks };
          const stored = await upsertImportedPlaylist(updated);
          setPlaylists(stored.map(withKind));
          void syncArtworkFromPlaylists(stored);
        })
        .catch(() => {
          // Se muestra igual; las coincidencias con el NAS se pueden reintentar luego.
        });
      return playlist;
    },
    [source],
  );

  const hydratingCovers = useRef(new Set<string>());

  const hydratePlaylistCovers = useCallback(async (playlist: ImportedPlaylist) => {
    if (!playlistNeedsCovers(playlist) || hydratingCovers.current.has(playlist.id)) return;
    hydratingCovers.current.add(playlist.id);
    try {
      const ids = playlist.tracks
        .filter((track) => trackNeedsCover(track, playlist.coverUrl))
        .map((track) => track.spotifyId);
      const covers = await loadTrackCoverMap(ids);
      if (!Object.keys(covers).length) return;
      const latest = (await loadImportedPlaylists()).find((item) => item.id === playlist.id) ?? playlist;
      const updated = { ...latest, tracks: applyCoverMap(latest.tracks, covers) };
      const stored = await upsertImportedPlaylist(updated);
      setPlaylists(stored.map(withKind));
      void syncArtworkFromPlaylists(stored);
    } finally {
      hydratingCovers.current.delete(playlist.id);
    }
  }, []);

  const deletePlaylist = useCallback(async (id: string) => {
    const next = await removeImportedPlaylist(id);
    setPlaylists(next.map(withKind));
  }, []);

  const togglePlaylistLiked = useCallback(async (id: string) => {
    const next = await toggleImportedPlaylistLiked(id);
    setPlaylists(next.map(withKind));
  }, []);

  const rematchPlaylist = useCallback(
    async (id: string) => {
      // WebDAV keeps an in-memory index; refresh so new Canciones files are visible.
      if (source.kind === "webdav") {
        await source.ping();
      }
      const current = (await loadImportedPlaylists()).find((item) => item.id === id);
      if (!current) return;
      const cleared = current.tracks.map((track) => ({ ...track, matched: null }));
      const tracks = await matchImportedTracks(source, cleared);
      const stored = await upsertImportedPlaylist({ ...current, tracks });
      setPlaylists(stored.map(withKind));
      void syncArtworkFromPlaylists(stored);
    },
    [source],
  );

  const value = useMemo(
    () => ({
      playlists,
      importPlaylistUrl,
      hydratePlaylistCovers,
      deletePlaylist,
      togglePlaylistLiked,
      rematchPlaylist,
    }),
    [deletePlaylist, hydratePlaylistCovers, importPlaylistUrl, playlists, rematchPlaylist, togglePlaylistLiked],
  );

  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>;
}

export function useSpotify(): SpotifyContextValue {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error("useSpotify must be used within SpotifyProvider");
  return ctx;
}
