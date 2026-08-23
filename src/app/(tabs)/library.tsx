import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowUpDown, LayoutGrid, List, Plus } from "lucide-react-native";
import { AlbumRow } from "@/components/library/album-row";
import { AlbumTile, ArtistTile } from "@/components/library/album-tile";
import { ArtistRow } from "@/components/library/artist-row";
import { ImportSheet } from "@/components/library/import-sheet";
import { LibrarySortSheet, librarySortLabel, type LibrarySort } from "@/components/library/library-sort-sheet";
import { LibraryTile } from "@/components/library/library-tile";
import { TrackRow } from "@/components/library/track-row";
import { FocusBoard } from "@/components/productivity/focus-board";
import { Screen } from "@/components/ui/screen";
import { SeriesRow, seriesListStyle } from "@/components/video/series-row";
import { albumHref, artistHref } from "@/lib/library/href";
import { useBrowsePrefs } from "@/hooks/use-browse-prefs";
import { useExitingList } from "@/hooks/use-exiting-list";
import { useLibrary, type LibraryTab } from "@/hooks/use-library";
import { usePlayer } from "@/lib/player/player-context";
import { usePlaylistActions } from "@/lib/spotify/playlist-actions-context";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { useSettings } from "@/lib/settings/settings-context";
import { browseRoute } from "@/lib/video/browse";
import { listVideoShows, type VideoShow } from "@/lib/video/catalog";
import { useVideoActions } from "@/lib/video/video-actions-context";
import { loadWatchHistory, peekWatchHistory, watchMatchesPath } from "@/lib/video/watch-history";
import { watchRoute } from "@/lib/video/onepiece";
import { colors, fonts, layout, type } from "@/lib/theme";
import { useZone } from "@/lib/zone/zone-context";
import {
  isPodcastAlbum,
  isPodcastArtist,
  isLooseSongsAlbum,
  isSongsArtist,
  isSongsFolderName,
} from "@/lib/nas/webdav";
import type { Album, Artist } from "@/lib/nas/types";
import type { ImportedPlaylist } from "@/lib/spotify/types";

const MUSIC_TABS: { id: LibraryTab; label: string }[] = [
  { id: "recents", label: "General" },
  { id: "playlists", label: "Playlists" },
  { id: "tracks", label: "Canciones" },
  { id: "artists", label: "Artistas" },
  { id: "albums", label: "Álbumes" },
];

const PODCAST_TABS: { id: LibraryTab; label: string }[] = [
  { id: "podcasts", label: "Programas" },
  { id: "tracks", label: "Episodios" },
];

const GENERAL_RECENT_LIMIT = 8;

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

type PlaylistEntry = { playlist: ImportedPlaylist; album: Album };

type MixItem =
  | { kind: "playlist"; key: string; playlist: ImportedPlaylist; album: Album }
  | { kind: "album"; key: string; album: Album }
  | { kind: "artist"; key: string; artist: Artist };

function albumDisplayName(album: Album): string {
  return isSongsFolderName(album.name) ? album.artistName : album.name;
}

function albumDisplaySubtitle(album: Album): string {
  if (isPodcastAlbum(album)) return "Podcast";
  if (isSongsFolderName(album.name)) return "Canciones";
  return `Álbum · ${album.artistName}`;
}

function itemTitle(item: MixItem): string {
  if (item.kind === "playlist") return item.playlist.name;
  if (item.kind === "album") return albumDisplayName(item.album);
  return item.artist.name;
}

function itemCreator(item: MixItem): string {
  if (item.kind === "playlist") return item.playlist.ownerName;
  if (item.kind === "album") return item.album.artistName;
  return item.artist.name;
}

function itemAdded(item: MixItem): number {
  if (item.kind === "playlist") return item.playlist.importedAt;
  if (item.kind === "album") return item.album.year ?? 0;
  return 0;
}

function sortMix(items: MixItem[], sort: LibrarySort): MixItem[] {
  const next = [...items];
  if (sort === "alpha") next.sort((a, b) => compareText(itemTitle(a), itemTitle(b)));
  else if (sort === "creator") next.sort((a, b) => compareText(itemCreator(a), itemCreator(b)));
  else if (sort === "added") next.sort((a, b) => itemAdded(b) - itemAdded(a));
  return next;
}

function Grid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

function Cell({ children }: { children: ReactNode }) {
  return <View style={styles.cell}>{children}</View>;
}

export default function LibraryScreen() {
  const router = useRouter();
  const { zone } = useZone();
  const { tab, setTab, artists, albums, tracks, error } = useLibrary();
  const tabs = zone === "podcast" ? PODCAST_TABS : MUSIC_TABS;
  const { items: visibleTracks, isExiting } = useExitingList(tracks);
  const { playTracks } = usePlayer();
  const { playlists } = useSpotify();
  const { openPlaylistActions } = usePlaylistActions();
  const [importOpen, setImportOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const { sort, viewMode, setSort, setViewMode, ready: browseReady } = useBrowsePrefs("snd.library.browse.v1");
  const grid = viewMode === "grid";

  useFocusEffect(
    useCallback(() => {
      if (zone === "music") setTab("recents");
      else if (zone === "podcast") setTab("podcasts");
    }, [setTab, zone]),
  );

  useEffect(() => {
    if (zone === "video" || zone === "focus") return;
    if (!tabs.some((item) => item.id === tab)) {
      setTab(tabs[0]?.id ?? "recents");
    }
  }, [setTab, tab, tabs, zone]);

  const playlistAlbums = useMemo<PlaylistEntry[]>(
    () =>
      playlists.map((playlist) => ({
        playlist,
        album: {
          id: playlist.id,
          name: playlist.name,
          artistId: playlist.id,
          artistName: playlist.ownerName,
          trackCount: playlist.tracks.length,
        } satisfies Album,
      })),
    [playlists],
  );

  const sortedPlaylists = useMemo(() => {
    const next = [...playlistAlbums];
    if (sort === "alpha") next.sort((a, b) => compareText(a.playlist.name, b.playlist.name));
    else if (sort === "creator") next.sort((a, b) => compareText(a.playlist.ownerName, b.playlist.ownerName));
    else next.sort((a, b) => b.playlist.importedAt - a.playlist.importedAt);
    return next;
  }, [playlistAlbums, sort]);

  const musicAlbums = useMemo(
    () => albums.filter((album) => !isPodcastAlbum(album) && !isLooseSongsAlbum(album)),
    [albums],
  );
  const musicArtistIds = useMemo(
    () => new Set(musicAlbums.map((album) => album.artistId)),
    [musicAlbums],
  );
  const musicArtists = useMemo(
    () =>
      artists.filter(
        (artist) =>
          !isPodcastArtist(artist) &&
          !isSongsArtist(artist) &&
          musicArtistIds.has(artist.id),
      ),
    [artists, musicArtistIds],
  );

  const sortedAlbums = useMemo(() => {
    const next = [...musicAlbums];
    if (sort === "alpha") next.sort((a, b) => compareText(albumDisplayName(a), albumDisplayName(b)));
    else if (sort === "creator") next.sort((a, b) => compareText(a.artistName, b.artistName));
    else if (sort === "added") next.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return next;
  }, [musicAlbums, sort]);

  const podcastAlbums = useMemo(() => {
    const next = albums.filter(isPodcastAlbum);
    if (sort === "alpha") next.sort((a, b) => compareText(a.name, b.name));
    else if (sort === "creator") next.sort((a, b) => compareText(a.artistName, b.artistName));
    else if (sort === "added") next.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return next;
  }, [albums, sort]);

  const sortedArtists = useMemo(() => {
    const next = [...musicArtists];
    if (sort === "alpha" || sort === "creator") next.sort((a, b) => compareText(a.name, b.name));
    return next;
  }, [musicArtists, sort]);

  const allMix = useMemo(
    () => [
      ...playlistAlbums.map((entry) => ({
        kind: "playlist" as const,
        key: `pl-${entry.playlist.id}`,
        ...entry,
      })),
      ...musicAlbums.map((album) => ({ kind: "album" as const, key: `al-${album.id}`, album })),
      ...musicArtists.map((artist) => ({ kind: "artist" as const, key: `ar-${artist.id}`, artist })),
    ],
    [musicAlbums, musicArtists, playlistAlbums],
  );

  const recentMix = useMemo(() => {
    const byRecency = sortMix(allMix, "added");
    return byRecency.slice(0, GENERAL_RECENT_LIMIT);
  }, [allMix]);

  const restMix = useMemo(() => {
    const recentKeys = new Set(recentMix.map((item) => item.key));
    return sortMix(
      allMix.filter((item) => !recentKeys.has(item.key)),
      sort,
    );
  }, [allMix, recentMix, sort]);

  function renderMixItem(item: MixItem) {
    if (item.kind === "playlist") {
      return wrap(item.key, playlistNode(item.playlist, item.album));
    }
    if (item.kind === "album") {
      return wrap(
        item.key,
        albumNode(item.album, albumDisplaySubtitle(item.album)),
      );
    }
    return wrap(item.key, artistNode(item.artist, "Artista"));
  }

  function wrap(key: string, node: ReactNode) {
    return grid ? <Cell key={key}>{node}</Cell> : <View key={key}>{node}</View>;
  }

  function playlistNode(playlist: ImportedPlaylist, album: Album) {
    const go = () => router.push(`/imported/${playlist.id}`);
    const configure = () => openPlaylistActions(playlist);
    const subtitle = `Playlist · ${playlist.ownerName}`;
    return grid ? (
      <AlbumTile
        album={album}
        coverUri={playlist.coverUrl}
        subtitle={subtitle}
        onPress={go}
        onLongPress={configure}
      />
    ) : (
      <AlbumRow
        album={album}
        coverUri={playlist.coverUrl}
        subtitle={subtitle}
        onPress={go}
        onLongPress={configure}
      />
    );
  }

  function albumNode(album: Album, subtitle = albumDisplaySubtitle(album)) {
    const go = () => router.push(albumHref(album.id));
    const shown = { ...album, name: albumDisplayName(album) };
    return grid ? (
      <AlbumTile album={shown} subtitle={subtitle} onPress={go} />
    ) : (
      <AlbumRow album={shown} subtitle={subtitle} onPress={go} />
    );
  }

  function artistNode(artist: Artist, subtitle: string) {
    const go = () => router.push(artistHref(artist.id));
    return grid ? (
      <ArtistTile
        id={artist.id}
        name={artist.name}
        subtitle={subtitle}
        coverId={artist.coverId}
        onPress={go}
      />
    ) : (
      <ArtistRow artist={artist} subtitle={subtitle} onPress={go} />
    );
  }

  function Collection({ children }: { children: ReactNode }) {
    return grid ? <Grid>{children}</Grid> : <View>{children}</View>;
  }

  if (zone === "focus") return <FocusBoard />;

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <Text style={[type.pageTitle, styles.title]}>Biblioteca</Text>
          {zone === "music" ? (
            <Pressable
              accessibilityLabel="Importar"
              onPress={() => setImportOpen(true)}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Plus size={24} color={colors.ink} strokeWidth={1.8} />
            </Pressable>
          ) : null}
        </View>

        {zone === "video" ? <VideoLibrary sort={sort} grid={grid} onSortPress={() => setSortOpen(true)} onToggleView={() => setViewMode(grid ? "list" : "grid")} browseReady={browseReady} /> : null}

        {zone !== "video" ? (
        <>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabs}
        >
          {tabs.map((item) => {
            const tabActive = item.id === tab;
            return (
              <Pressable
                key={item.id}
                onPress={() => setTab(item.id)}
                style={[styles.tab, tabActive && styles.tabActive]}
              >
                <Text style={[styles.tabLabel, tabActive && styles.tabLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab !== "tracks" && browseReady ? (
          <View style={styles.sortBar}>
            <Pressable
              onPress={() => setSortOpen(true)}
              style={({ pressed }) => [styles.sortRow, { opacity: pressed ? 0.7 : 1 }]}
            >
              <ArrowUpDown size={14} color={colors.ink} strokeWidth={2} />
              <Text style={styles.sortLabel}>{librarySortLabel(sort)}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={grid ? "Ver lista" : "Ver cuadrícula"}
              onPress={() => setViewMode(grid ? "list" : "grid")}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              {grid ? (
                <List size={20} color={colors.ink} strokeWidth={1.8} />
              ) : (
                <LayoutGrid size={18} color={colors.ink} strokeWidth={1.8} />
              )}
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {browseReady ? (
          <>
        {tab === "recents" ? (
          <>
            {recentMix.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Recientes</Text>
                <Collection>{recentMix.map((item) => renderMixItem(item))}</Collection>
              </View>
            ) : null}
            {restMix.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Todo</Text>
                <Collection>{restMix.map((item) => renderMixItem(item))}</Collection>
              </View>
            ) : null}
            {!recentMix.length && !restMix.length ? (
              <Text style={type.body}>Aún no hay nada en la biblioteca.</Text>
            ) : null}
          </>
        ) : null}

        {tab === "playlists" ? (
          sortedPlaylists.length ? (
            <Collection>
              {sortedPlaylists.map(({ playlist, album }) =>
                wrap(playlist.id, playlistNode(playlist, album)),
              )}
            </Collection>
          ) : (
            <Text style={type.body}>Aún no hay playlists. Pulsa + para importar un enlace.</Text>
          )
        ) : null}

        {tab === "podcasts" ? (
          podcastAlbums.length ? (
            <Collection>
              {podcastAlbums.map((album) => wrap(album.id, albumNode(album, "Podcast")))}
            </Collection>
          ) : (
            <Text style={type.body}>
              Aún no hay podcasts. Descarga uno en Ajustes → Podcasts (yt-dlp) a Music/Podcasts.
            </Text>
          )
        ) : null}

        {tab === "artists" ? (
          sortedArtists.length ? (
            <Collection>
              {sortedArtists.map((artist) =>
                wrap(
                  artist.id,
                  artistNode(artist, artist.albumCount ? `${artist.albumCount} ${artist.albumCount === 1 ? "álbum" : "álbumes"}` : "Artista"),
                ),
              )}
            </Collection>
          ) : (
            <Text style={type.body}>Aún no hay artistas en la biblioteca.</Text>
          )
        ) : null}

        {tab === "albums" ? (
          sortedAlbums.length ? (
            <Collection>
              {sortedAlbums.map((album) => wrap(album.id, albumNode(album)))}
            </Collection>
          ) : (
            <Text style={type.body}>Aún no hay álbumes en la biblioteca.</Text>
          )
        ) : null}

        {tab === "tracks"
          ? visibleTracks.length
            ? visibleTracks.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index + 1}
                  exiting={isExiting(track.id)}
                  onPress={() => {
                    if (isExiting(track.id)) return;
                    const playIndex = tracks.findIndex((item) => item.id === track.id);
                    if (playIndex < 0) return;
                    void playTracks(tracks, playIndex);
                  }}
                />
              ))
            : <Text style={type.body}>{zone === "podcast" ? "Aún no hay episodios." : "Aún no hay canciones en la biblioteca."}</Text>
          : null}
          </>
        ) : null}
        </>
        ) : null}
      </Screen>
      <ImportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => setTab("playlists")}
      />
      <LibrarySortSheet
        open={sortOpen}
        value={sort}
        onOpenChange={setSortOpen}
        onChange={setSort}
      />
    </>
  );
}

function showRecency(show: VideoShow): number {
  const hit = peekWatchHistory().find((entry) => watchMatchesPath(entry, show.path));
  return hit?.watchedAt ?? 0;
}

function VideoLibrary({
  sort,
  grid,
  onSortPress,
  onToggleView,
  browseReady,
}: {
  sort: LibrarySort;
  grid: boolean;
  onSortPress: () => void;
  onToggleView: () => void;
  browseReady: boolean;
}) {
  const router = useRouter();
  const { settings, password, ready } = useSettings();
  const { openVideoActions } = useVideoActions();
  const [shows, setShows] = useState<VideoShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadWatchHistory();
      setShows(await listVideoShows(settings, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el vídeo.");
      setShows([]);
    } finally {
      setLoading(false);
    }
  }, [password, settings]);

  useFocusEffect(
    useCallback(() => {
      if (ready) void refresh();
    }, [ready, refresh]),
  );

  const sortedShows = useMemo(() => {
    const next = [...shows];
    if (sort === "alpha") next.sort((a, b) => compareText(a.title, b.title));
    else if (sort === "creator") {
      next.sort((a, b) => {
        const kind = Number(a.kind === "movie") - Number(b.kind === "movie");
        return kind || compareText(a.title, b.title);
      });
    } else {
      next.sort((a, b) => showRecency(b) - showRecency(a) || compareText(a.title, b.title));
    }
    return next;
  }, [shows, sort]);

  const recentShows = useMemo(
    () => (sort === "recents" || sort === "added" ? sortedShows.filter((show) => showRecency(show) > 0) : []),
    [sort, sortedShows],
  );
  const restShows = useMemo(() => {
    if (sort === "recents" || sort === "added") {
      return sortedShows.filter((show) => showRecency(show) === 0);
    }
    return sortedShows;
  }, [sort, sortedShows]);

  const seriesCount = shows.filter((show) => show.kind === "series").length;
  const moviesCount = shows.filter((show) => show.kind === "movie").length;
  const series = restShows.filter((show) => show.kind === "series");
  const movies = restShows.filter((show) => show.kind === "movie");

  function openShow(show: VideoShow) {
    if (show.kind === "movie" && show.file) {
      router.push(watchRoute(show.path, show.path.replace(/\/[^/]+$/, "") || show.path));
      return;
    }
    router.push(browseRoute(show.path));
  }

  function configure(show: VideoShow) {
    openVideoActions(
      { kind: "folder", id: show.id, path: show.path, title: show.title },
      { onChanged: refresh },
    );
  }

  function renderShow(show: VideoShow) {
    const subtitle = show.kind === "movie" ? "Película" : "Serie";
    if (grid) {
      return (
        <View key={show.id} style={styles.cell}>
          <LibraryTile
            id={show.id}
            title={show.title}
            subtitle={subtitle}
            onPress={() => openShow(show)}
            onLongPress={() => configure(show)}
          />
        </View>
      );
    }
    return (
      <SeriesRow
        key={show.id}
        title={show.title}
        subtitle={subtitle}
        playable={show.kind === "movie" && show.file}
        onPress={() => openShow(show)}
        onLongPress={() => configure(show)}
      />
    );
  }

  function Collection({
    items,
    inset,
  }: {
    items: VideoShow[];
    inset?: boolean;
  }) {
    if (!items.length) return null;
    if (grid) return <View style={styles.grid}>{items.map(renderShow)}</View>;
    return <View style={inset ? seriesListStyle : undefined}>{items.map(renderShow)}</View>;
  }

  return (
    <View style={styles.section}>
      <Text style={type.meta}>
        {loading
          ? "Cargando…"
          : shows.length
            ? `${seriesCount ? `${seriesCount} serie${seriesCount === 1 ? "" : "s"}` : ""}${seriesCount && moviesCount ? " · " : ""}${moviesCount ? `${moviesCount} película${moviesCount === 1 ? "" : "s"}` : ""}`
            : "Sin series ni películas en el NAS"}
      </Text>

      {browseReady ? (
        <View style={styles.sortBar}>
          <Pressable
            onPress={onSortPress}
            style={({ pressed }) => [styles.sortRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <ArrowUpDown size={14} color={colors.ink} strokeWidth={2} />
            <Text style={styles.sortLabel}>{librarySortLabel(sort)}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={grid ? "Ver lista" : "Ver cuadrícula"}
            onPress={onToggleView}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            {grid ? (
              <List size={20} color={colors.ink} strokeWidth={1.8} />
            ) : (
              <LayoutGrid size={18} color={colors.ink} strokeWidth={1.8} />
            )}
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {recentShows.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Recientes</Text>
          <Collection items={recentShows} inset />
        </View>
      ) : null}

      {series.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Series</Text>
          <Collection items={series} inset />
        </View>
      ) : null}
      {movies.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Películas</Text>
          <Collection items={movies} inset />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
  },
  title: { flex: 1 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  tabsScroll: {
    marginHorizontal: -layout.screenPad,
    flexGrow: 0,
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: layout.screenPad,
    paddingRight: layout.screenPad + 28,
  },
  tab: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.sheet,
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  tabLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.inkSoft },
  tabLabelActive: { color: colors.void },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  sortLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink },
  section: { gap: 10 },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.inkSoft,
    paddingTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  cell: {
    width: "33.333%",
    paddingHorizontal: 6,
    paddingBottom: 18,
  },
  error: { ...type.body, color: colors.danger },
});
