import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowUpDown, LayoutGrid, List, Plus } from "lucide-react-native";
import { AlbumRow } from "@/components/library/album-row";
import { AlbumTile, ArtistTile } from "@/components/library/album-tile";
import { ArtistRow } from "@/components/library/artist-row";
import { ImportSheet } from "@/components/library/import-sheet";
import { LibrarySortSheet, librarySortLabel, type LibrarySort } from "@/components/library/library-sort-sheet";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { useBrowsePrefs } from "@/hooks/use-browse-prefs";
import { useLibrary, type LibraryTab } from "@/hooks/use-library";
import { usePlayer } from "@/lib/player/player-context";
import { useImportedSheet } from "@/lib/spotify/imported-sheet-context";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { colors, fonts, layout, type } from "@/lib/theme";
import type { Album, Artist } from "@/lib/nas/types";
import type { ImportedPlaylist } from "@/lib/spotify/types";

const TABS: { id: LibraryTab; label: string }[] = [
  { id: "recents", label: "Recientes" },
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artistas" },
  { id: "albums", label: "Álbumes" },
  { id: "tracks", label: "Canciones" },
];

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

type PlaylistEntry = { playlist: ImportedPlaylist; album: Album };

type MixItem =
  | { kind: "playlist"; key: string; playlist: ImportedPlaylist; album: Album }
  | { kind: "album"; key: string; album: Album }
  | { kind: "artist"; key: string; artist: Artist };

function itemTitle(item: MixItem): string {
  if (item.kind === "playlist") return item.playlist.name;
  if (item.kind === "album") return item.album.name;
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
  const { tab, setTab, artists, albums, tracks, error } = useLibrary();
  const { playTracks } = usePlayer();
  const { playlists } = useSpotify();
  const { openImported } = useImportedSheet();
  const [importOpen, setImportOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const { sort, viewMode, setSort, setViewMode } = useBrowsePrefs("snd.library.browse.v1");
  const grid = viewMode === "grid";

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

  const sortedAlbums = useMemo(() => {
    const next = [...albums];
    if (sort === "alpha") next.sort((a, b) => compareText(a.name, b.name));
    else if (sort === "creator") next.sort((a, b) => compareText(a.artistName, b.artistName));
    else if (sort === "added") next.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return next;
  }, [albums, sort]);

  const sortedArtists = useMemo(() => {
    const next = [...artists];
    if (sort === "alpha" || sort === "creator") next.sort((a, b) => compareText(a.name, b.name));
    return next;
  }, [artists, sort]);

  const mixed = useMemo(
    () =>
      sortMix(
        [
          ...playlistAlbums.map((entry) => ({
            kind: "playlist" as const,
            key: `pl-${entry.playlist.id}`,
            ...entry,
          })),
          ...albums.map((album) => ({ kind: "album" as const, key: `al-${album.id}`, album })),
          ...artists.map((artist) => ({ kind: "artist" as const, key: `ar-${artist.id}`, artist })),
        ],
        sort,
      ),
    [albums, artists, playlistAlbums, sort],
  );

  function wrap(key: string, node: ReactNode) {
    return grid ? <Cell key={key}>{node}</Cell> : <View key={key}>{node}</View>;
  }

  function playlistNode(playlist: ImportedPlaylist, album: Album) {
    const go = () => openImported(playlist.id);
    const subtitle = `Playlist · ${playlist.ownerName}`;
    return grid ? (
      <AlbumTile album={album} coverUri={playlist.coverUrl} subtitle={subtitle} onPress={go} />
    ) : (
      <AlbumRow album={album} coverUri={playlist.coverUrl} subtitle={subtitle} onPress={go} />
    );
  }

  function albumNode(album: Album) {
    const go = () => router.push(`/album/${album.id}`);
    return grid ? (
      <AlbumTile album={album} subtitle={`Álbum · ${album.artistName}`} onPress={go} />
    ) : (
      <AlbumRow album={album} subtitle={`Álbum · ${album.artistName}`} onPress={go} />
    );
  }

  function artistNode(artist: Artist, subtitle: string) {
    const go = () => router.push(`/artist/${artist.id}`);
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

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <Text style={[type.pageTitle, styles.title]}>Biblioteca</Text>
          <Pressable
            accessibilityLabel="Importar"
            onPress={() => setImportOpen(true)}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Plus size={24} color={colors.ink} strokeWidth={1.8} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabs}
        >
          {TABS.map((item) => {
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

        {tab !== "tracks" ? (
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

        {tab === "recents" ? (
          <Collection>
            {mixed.map((item) => {
              if (item.kind === "playlist") {
                return wrap(item.key, playlistNode(item.playlist, item.album));
              }
              if (item.kind === "album") {
                return wrap(item.key, albumNode(item.album));
              }
              return wrap(item.key, artistNode(item.artist, "Artista"));
            })}
          </Collection>
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

        {tab === "artists" ? (
          <Collection>
            {sortedArtists.map((artist) =>
              wrap(
                artist.id,
                artistNode(artist, artist.albumCount ? `${artist.albumCount} álbumes` : "Artista"),
              ),
            )}
          </Collection>
        ) : null}

        {tab === "albums" ? (
          <Collection>
            {sortedAlbums.map((album) => wrap(album.id, albumNode(album)))}
          </Collection>
        ) : null}

        {tab === "tracks"
          ? tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index + 1}
                onPress={() => void playTracks(tracks, index)}
              />
            ))
          : null}
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
    paddingHorizontal: layout.screenPad,
  },
  tab: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 14,
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
