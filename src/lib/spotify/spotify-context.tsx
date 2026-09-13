import { t } from "@/lib/i18n/runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import {
  hydrateTrackArtworkCache,
  syncArtworkFromPlaylists,
} from "@/lib/library/artwork-cache";
import { fillUnmatchedImportedPlaylists, matchImportedTracks } from "@/lib/spotify/match";
import { parseSpotifyUrl } from "@/lib/spotify/parse-url";
import { fetchPublicSpotifyEntity } from "@/lib/spotify/public-playlist";
import { parseYoutubeMusicUrl } from "@/lib/youtube/parse-url";
import { fetchPublicYoutubeMusic } from "@/lib/youtube/public-playlist";
import {
  addTracksToImportedPlaylist,
  loadImportedPlaylists,
  onPlaylistStoreChanged,
  removeImportedPlaylist,
  removeTrackFromImportedPlaylist,
  reorderImportedPlaylistTracks,
  saveImportedPlaylists,
  toggleImportedPlaylistLiked,
  updateImportedPlaylist,
  updateImportedTrackCover,
  upsertImportedPlaylist,
} from "@/lib/spotify/playlist-store";
import { pullPlaylistsFromSources, pushPlaylistsToSources } from "@/lib/spotify/playlist-sync";
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
  rematchPlaylist: (id: string) => Promise<{ matched: number; missing: number }>;
  reloadPlaylists: () => Promise<void>;
  updatePlaylistDetails: (id: string, updates: { name?: string; coverUrl?: string | null }) => Promise<void>;
  updateTrackCover: (trackId: string, coverUrl: string) => Promise<void>;
};

const SpotifyContext = createContext<SpotifyContextValue | null>(null);

function withKind(playlist: ImportedPlaylist): ImportedPlaylist {
  return { ...playlist, kind: playlist.kind ?? "playlist" };
}

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const { ready: settingsReady, settings, password, source } = useSettings();
  const [playlists, setPlaylists] = useState<ImportedPlaylist[]>([]);
  const settingsRef = useRef(settings);
  const passwordRef = useRef(password);
  const sourceRef = useRef(source);
  settingsRef.current = settings;
  passwordRef.current = password;
  sourceRef.current = source;
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncing = useRef(false);
  const hydratingCovers = useRef(new Set<string>());

  const applyPlaylists = useCallback((next: ImportedPlaylist[]) => {
    const mapped = next.map(withKind);
    setPlaylists(mapped);
    void syncArtworkFromPlaylists(mapped).then(() => persistPlaylistCovers(sourceRef.current, mapped));
  }, []);

  const mirror = useCallback(() => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void pushPlaylistsToSources(settingsRef.current, passwordRef.current).catch(() => {
        // NAS / carpeta local are best-effort.
      });
    }, 500);
  }, []);

  const reloadPlaylists = useCallback(async () => {
    applyPlaylists(await loadImportedPlaylists());
  }, [applyPlaylists]);

  const lastSeed = useRef("");
  const syncFromSources = useCallback(async () => {
    if (!settingsReady || syncing.current) return;
    syncing.current = true;
    try {
      const pulled = await pullPlaylistsFromSources(settings, password);
      if (pulled) {
        const current = sourceRef.current;
        if (current.kind === "webdav") {
          await current.ping();
        }
        const latest = await loadImportedPlaylists();
        const filled = await fillUnmatchedImportedPlaylists(current, latest);
        if (filled.changed) {
          await saveImportedPlaylists(filled.playlists);
          void pushPlaylistsToSources(settings, password);
          applyPlaylists(filled.playlists);
        } else {
          applyPlaylists(latest);
        }
        return;
      }
      const seedKey = `${settings.sourceKind}:${settings.sharePath}:${settings.localFolderUri}:${Boolean(password)}`;
      if (lastSeed.current === seedKey) return;
      lastSeed.current = seedKey;
      const local = await loadImportedPlaylists();
      if (local.length) {
        void pushPlaylistsToSources(settings, password);
      }
    } catch {
      // NAS is optional; local SQLite stays.
    } finally {
      syncing.current = false;
    }
  }, [applyPlaylists, password, settings, settingsReady]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateTrackArtworkCache();
      const stored = await loadImportedPlaylists();
      if (cancelled) return;
      applyPlaylists(stored);
      await syncFromSources();
    })().catch(() => {
      if (!cancelled) setPlaylists([]);
    });
    return () => {
      cancelled = true;
    };
  }, [applyPlaylists, syncFromSources]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncFromSources();
    });
    return () => sub.remove();
  }, [syncFromSources]);

  useEffect(() => onPlaylistStoreChanged(() => {
    void reloadPlaylists();
  }), [reloadPlaylists]);

  useEffect(() => () => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
  }, []);

  const importPlaylistUrl = useCallback(
    async (url: string) => {
      const youtube = parseYoutubeMusicUrl(url);
      const parsed = youtube ? null : parseSpotifyUrl(url);
      if (!youtube && !parsed) {
        throw new Error(t("nasExtra.pasteSpotifyYoutube"));
      }
      const publicEntity = youtube
        ? await fetchPublicYoutubeMusic(url, youtube)
        : await fetchPublicSpotifyEntity(parsed!.kind, parsed!.id);
      const playlist: ImportedPlaylist = {
        ...publicEntity,
        importedAt: Date.now(),
      };
      const next = await upsertImportedPlaylist(playlist);
      applyPlaylists(next);
      mirror();
      void matchImportedTracks(source, playlist.tracks)
        .then(async (tracks) => {
          const updated = { ...playlist, tracks };
          const stored = await upsertImportedPlaylist(updated);
          applyPlaylists(stored);
          mirror();
        })
        .catch(() => {
          // Se muestra igual; las coincidencias con el NAS se pueden reintentar luego.
        });
      return playlist;
    },
    [applyPlaylists, mirror, source],
  );

  const createLocalPlaylist = useCallback(async (name: string, tracks: Track[]) => {
    const title = name.trim();
    if (!title) throw new Error(t("nasExtra.playlistNeedName"));
    const picked = tracks.filter(Boolean);
    if (!picked.length) throw new Error(t("nasExtra.pickNasTrack"));
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
    applyPlaylists(stored);
    mirror();
    return playlist;
  }, [applyPlaylists, mirror]);

  const addTracksToPlaylist = useCallback(async (playlistId: string, tracks: Track[]) => {
    const stored = await addTracksToImportedPlaylist(playlistId, tracks);
    applyPlaylists(stored);
    mirror();
  }, [applyPlaylists, mirror]);

  const removeTrackFromPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    const stored = await removeTrackFromImportedPlaylist(playlistId, trackId);
    applyPlaylists(stored);
    mirror();
  }, [applyPlaylists, mirror]);

  const reorderPlaylistTracks = useCallback(async (playlistId: string, tracks: ImportedTrack[]) => {
    const stored = await reorderImportedPlaylistTracks(playlistId, tracks);
    applyPlaylists(stored);
    mirror();
  }, [applyPlaylists, mirror]);

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
      applyPlaylists(stored);
      mirror();
    } finally {
      hydratingCovers.current.delete(playlist.id);
    }
  }, [applyPlaylists, mirror]);

  const deletePlaylist = useCallback(async (id: string) => {
    const next = await removeImportedPlaylist(id);
    applyPlaylists(next);
    mirror();
  }, [applyPlaylists, mirror]);

  const togglePlaylistLiked = useCallback(async (id: string) => {
    const next = await toggleImportedPlaylistLiked(id);
    applyPlaylists(next);
    mirror();
  }, [applyPlaylists, mirror]);

  useEffect(() => subscribeAssistantMutations(() => {
    void reloadPlaylists().then(() => mirror());
  }), [mirror, reloadPlaylists]);

  const rematchPlaylist = useCallback(
    async (id: string) => {
      // WebDAV keeps an in-memory index; refresh so new Canciones files are visible.
      if (source.kind === "webdav") {
        await source.ping();
      }
      const current = (await loadImportedPlaylists()).find((item) => item.id === id);
      if (!current) return { matched: 0, missing: 0 };
      const cleared = current.tracks.map((track) => ({ ...track, matched: null }));
      const tracks = await matchImportedTracks(source, cleared);
      const stored = await upsertImportedPlaylist({ ...current, tracks });
      applyPlaylists(stored);
      mirror();
      const matched = tracks.filter((track) => track.matched).length;
      return { matched, missing: tracks.length - matched };
    },
    [applyPlaylists, mirror, source],
  );

  const updatePlaylistDetails = useCallback(
    async (id: string, updates: { name?: string; coverUrl?: string | null }) => {
      const next = await updateImportedPlaylist(id, updates);
      applyPlaylists(next);
      mirror();
    },
    [applyPlaylists, mirror],
  );

  const updateTrackCover = useCallback(
    async (trackId: string, coverUrl: string) => {
      const next = await updateImportedTrackCover(trackId, coverUrl);
      applyPlaylists(next);
      mirror();
    },
    [applyPlaylists, mirror],
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
      updatePlaylistDetails,
      updateTrackCover,
    }),
    [addTracksToPlaylist, createLocalPlaylist, deletePlaylist, hydratePlaylistCovers, importPlaylistUrl, playlists, reloadPlaylists, rematchPlaylist, removeTrackFromPlaylist, reorderPlaylistTracks, togglePlaylistLiked, updatePlaylistDetails, updateTrackCover],
  );

  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>;
}

export function useSpotify(): SpotifyContextValue {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error("useSpotify must be used within SpotifyProvider");
  return ctx;
}
