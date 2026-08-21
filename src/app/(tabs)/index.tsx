import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowUpDown, LayoutGrid, List } from "lucide-react-native";
import { HomeListSkeleton, HomeShortcutBone } from "@/components/home/home-skeleton";
import { ShortcutCard } from "@/components/home/shortcut-card";
import { AlbumRow } from "@/components/library/album-row";
import { AlbumTile } from "@/components/library/album-tile";
import { LibrarySortSheet, librarySortLabel } from "@/components/library/library-sort-sheet";
import { LibraryTile } from "@/components/library/library-tile";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { useCoverUrl } from "@/hooks/use-cover-url";
import { useBrowsePrefs } from "@/hooks/use-browse-prefs";
import { useHome } from "@/hooks/use-home";
import type { Track } from "@/lib/nas/types";
import { usePlayer } from "@/lib/player/player-context";
import { useImportedSheet } from "@/lib/spotify/imported-sheet-context";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { colors, fonts, type } from "@/lib/theme";

const SHORTCUT_SLOTS = 8;

export default function HomeScreen() {
  const router = useRouter();
  const { recents, albums, loading, error, refresh } = useHome();
  const { playlists } = useSpotify();
  const { openImported } = useImportedSheet();
  const { playTracks } = usePlayer();
  const [sortOpen, setSortOpen] = useState(false);
  const { sort, viewMode, setSort, setViewMode } = useBrowsePrefs("snd.home.browse.v1");
  const grid = viewMode === "grid";

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const shortcuts = useMemo(() => {
    const items: {
      key: string;
      id: string;
      title: string;
      coverId?: string | null;
      uri?: string | null;
      liked?: boolean;
      onPress: () => void;
    }[] = [
      {
        key: "favorites",
        id: "favorites",
        title: "Favoritos",
        liked: true,
        onPress: () => router.push("/favorites"),
      },
    ];

    for (const playlist of playlists) {
      if (items.length >= SHORTCUT_SLOTS) break;
      items.push({
        key: `playlist-${playlist.id}`,
        id: playlist.id,
        title: playlist.name,
        uri: playlist.coverUrl,
        onPress: () => openImported(playlist.id),
      });
    }

    for (const album of albums) {
      if (items.length >= SHORTCUT_SLOTS) break;
      items.push({
        key: `album-${album.id}`,
        id: album.id,
        title: album.name,
        coverId: album.coverId,
        onPress: () => router.push(`/album/${album.id}`),
      });
    }

    return items;
  }, [albums, openImported, playlists, router]);

  const emptyLibrary = !albums.length && !recents.length;
  const showSkeleton = loading || emptyLibrary;
  const gridAlbumIds = new Set(
    shortcuts.filter((item) => item.key.startsWith("album-")).map((item) => item.id),
  );
  const moreAlbums = albums.filter((album) => !gridAlbumIds.has(album.id));

  const sortedRecents = useMemo(() => {
    const next = [...recents];
    if (sort === "alpha") next.sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
    else if (sort === "creator") {
      next.sort((a, b) => a.artistName.localeCompare(b.artistName, "es", { sensitivity: "base" }));
    }
    return next;
  }, [recents, sort]);

  const sortedAlbums = useMemo(() => {
    const next = [...moreAlbums];
    if (sort === "alpha") next.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    else if (sort === "creator") {
      next.sort((a, b) => a.artistName.localeCompare(b.artistName, "es", { sensitivity: "base" }));
    } else if (sort === "added") next.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return next;
  }, [moreAlbums, sort]);

  return (
    <>
    <Screen>
      <View style={styles.hero}>
        <Text style={type.pageTitle}>SND</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.shortcuts}>
        {shortcuts.map((item) => (
          <ShortcutCard
            key={item.key}
            id={item.id}
            title={item.title}
            coverId={item.coverId}
            uri={item.uri}
            liked={item.liked}
            onPress={item.onPress}
          />
        ))}
        {showSkeleton
          ? Array.from({ length: Math.max(0, SHORTCUT_SLOTS - shortcuts.length) }, (_, index) => (
              <HomeShortcutBone key={`shortcut-bone-${index}`} />
            ))
          : null}
      </View>

      {showSkeleton ? <HomeListSkeleton grid={grid} /> : null}

      {recents.length || moreAlbums.length ? (
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

      {sortedRecents.length || sortedAlbums.length ? (
        grid ? (
          <View style={styles.collection}>
            {sortedRecents.slice(0, 6).map((track, index) => (
              <View key={track.id} style={styles.cell}>
                <HomeTrackTile track={track} onPress={() => void playTracks(sortedRecents, index)} />
              </View>
            ))}
            {sortedAlbums.map((album) => (
              <View key={album.id} style={styles.cell}>
                <AlbumTile
                  album={album}
                  subtitle={`Álbum · ${album.artistName}`}
                  onPress={() => router.push(`/album/${album.id}`)}
                />
              </View>
            ))}
          </View>
        ) : (
          <>
            {sortedRecents.slice(0, 6).map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index + 1}
                onPress={() => void playTracks(sortedRecents, index)}
              />
            ))}
            {sortedAlbums.map((album) => (
              <AlbumRow key={album.id} album={album} onPress={() => router.push(`/album/${album.id}`)} />
            ))}
          </>
        )
      ) : null}
    </Screen>
    <LibrarySortSheet open={sortOpen} value={sort} onOpenChange={setSortOpen} onChange={setSort} />
    </>
  );
}

function HomeTrackTile({ track, onPress }: { track: Track; onPress: () => void }) {
  const cover = useCoverUrl(track.coverId);
  return (
    <LibraryTile
      id={track.id}
      title={track.title}
      subtitle={track.artistName}
      uri={cover}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8, paddingTop: 8, paddingBottom: 4 },
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
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  collection: {
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
  shortcuts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
