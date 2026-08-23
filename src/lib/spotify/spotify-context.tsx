import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  hydrateTrackArtworkCache,
  syncArtworkFromPlaylists,
} from "@/lib/library/artwork-cache";
import { matchImportedTracks } from "@/lib/spotify/match";
import { parseSpotifyUrl } from "@/lib/spotify/parse-url";
import { fetchPublicSpotifyEntity } from "@/lib/spotify/public-playlist";
import { parseYoutubeMusicUrl } from "@/lib/youtube/parse-url";
import { fetchPublicYoutubeMusic } from "@/lib/youtube/public-playlist";
import {
  addTracksToImportedPlaylist,
  loadImportedPlaylists,
  removeImportedPlaylist,
  removeTrackFromImportedPlaylist,
  reorderImportedPlaylistTracks,
  toggleImportedPlaylistLiked,
  upsertImportedPlaylist,
} from "@/lib/spotify/playlist-store";
import { subscribeAssistantMutations } from "@/lib/cursor/assistant-bus";
import { useSettings } from "@/lib/settings/settings-context";
import { persistPlaylistCovers } from "@/lib/library/persist-covers";
import { applyCoverMap, loadTrackCoverMap, playlistNeedsCovers, trackNeedsCover } from "@/lib/spotify/track-covers";
import type { Track } from "@/lib/nas/types";
import { getTrackArtworkUrl } from "@/lib/library/artwork-cache";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/spotify/types";

type SpotifyContextValue = {
  playlists: ImportedPlaylist[];
  importPlaylistUrl: (url: string) => Promise<ImportedPlaylist>;
  createLocalPlaylist: (name: string, tracks: Track[]) => Promise<ImportedPlaylist>;
  addTracksToPlaylist: (playlistId: string, tracks: Track[]) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  reorderPlaylistTracks: (playlistId: string, tracks: ImportedTrack[]) => Promise<void>;
  hydratePlaylistCovers: (playlist: ImportedPlaylist) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  togglePlaylistLiked: (id: string) => Promise<void>;
  rematchPlaylist: (id: string) => Promise<void>;
  reloadPlaylists: () => Promise<void>;
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
      void syncArtworkFromPlaylists(stored).then(() => persistPlaylistCovers(source, stored));
    })().catch(() => {
      if (!cancelled) setPlaylists([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const importPlaylistUrl = useCallback(
    async (url: string) => {
      const youtube = parseYoutubeMusicUrl(url);
      const parsed = youtube ? null : parseSpotifyUrl(url);
      if (!youtube && !parsed) {
        throw new Error("Pega un enlace de Spotify o de YouTube Music.");
      }
      const publicEntity = youtube
        ? await fetchPublicYoutubeMusic(url, youtube)
        : await fetchPublicSpotifyEntity(parsed!.kind, parsed!.id);
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
          void syncArtworkFromPlaylists(stored).then(() => persistPlaylistCovers(source, stored));
        })
        .catch(() => {
          // Se muestra igual; las coincidencias con el NAS se pueden reintentar luego.
        });
      return playlist;
    },
    [source],
  );

  const createLocalPlaylist = useCallback(async (name: string, tracks: Track[]) => {
    const title = name.trim();
    if (!title) throw new Error("Ponle un nombre a la playlist.");
    const picked = tracks.filter(Boolean);
    if (!picked.length) throw new Error("Elige al menos una canción del NAS.");
    const imported = picked.map((track) => ({
      spotifyId: track.id,
      title: track.title,
      artistName: track.artistName,
      albumName: track.albumName,
      durationMs: track.durationMs,
      coverUrl: track.artworkUrl || getTrackArtworkUrl(track.id) || null,
      matched: track,
    }));
    const playlist: ImportedPlaylist = {
      id: `local-${Date.now()}`,
      kind: "local",
      name: title,
      ownerName: "NAS",
      coverUrl: imported.find((track) => track.coverUrl)?.coverUrl ?? null,
      spotifyUrl: "",
      importedAt: Date.now(),
      tracks: imported,
    };
    const stored = await upsertImportedPlaylist(playlist);
    setPlaylists(stored.map(withKind));
    return playlist;
  }, []);

  const addTracksToPlaylist = useCallback(async (playlistId: string, tracks: Track[]) => {
    const stored = await addTracksToImportedPlaylist(playlistId, tracks);
    setPlaylists(stored.map(withKind));
  }, []);

  const removeTrackFromPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    const stored = await removeTrackFromImportedPlaylist(playlistId, trackId);
    setPlaylists(stored.map(withKind));
  }, []);

  const reorderPlaylistTracks = useCallback(async (playlistId: string, tracks: ImportedTrack[]) => {
    const stored = await reorderImportedPlaylistTracks(playlistId, tracks);
    setPlaylists(stored.map(withKind));
  }, []);

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
      void syncArtworkFromPlaylists(stored).then(() => persistPlaylistCovers(source, stored));
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

  const reloadPlaylists = useCallback(async () => {
    const stored = await loadImportedPlaylists();
    setPlaylists(stored.map(withKind));
  }, []);

  useEffect(() => subscribeAssistantMutations(() => { void reloadPlaylists(); }), [reloadPlaylists]);

  const rematchPlaylist = useCallback(
    async (id: string) => {
      // WebDAV keeps an in-memory index; refresh so new Canciones files are visible.
      if (source.kind === "webdav") {
        await source.ping();
      }
      const current = (await loadImportedPlaylists()).find((item) => item.id === id);
      if (!current || current.kind === "local") return;
      const cleared = current.tracks.map((track) => ({ ...track, matched: null }));
      const tracks = await matchImportedTracks(source, cleared);
      const stored = await upsertImportedPlaylist({ ...current, tracks });
      setPlaylists(stored.map(withKind));
      void syncArtworkFromPlaylists(stored).then(() => persistPlaylistCovers(source, stored));
    },
    [source],
  );

  const value = useMemo(
    () => ({
      playlists,
      importPlaylistUrl,
      createLocalPlaylist,
      addTracksToPlaylist,
      removeTrackFromPlaylist,
      reorderPlaylistTracks,
      hydratePlaylistCovers,
      deletePlaylist,
      togglePlaylistLiked,
      rematchPlaylist,
      reloadPlaylists,
    }),
    [addTracksToPlaylist, createLocalPlaylist, deletePlaylist, hydratePlaylistCovers, importPlaylistUrl, playlists, reloadPlaylists, rematchPlaylist, removeTrackFromPlaylist, reorderPlaylistTracks, togglePlaylistLiked],
  );

  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>;
}

export function useSpotify(): SpotifyContextValue {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error("useSpotify must be used within SpotifyProvider");
  return ctx;
}
