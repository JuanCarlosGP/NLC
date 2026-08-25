import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowUpDown, LayoutGrid, List } from "lucide-react-native";
import { FocusHome } from "@/components/productivity/focus-home";
import { WealthHome } from "@/components/wealth/wealth-home";
import { LadybugMark } from "@/components/brand/ladybug-mark";
import { ZoneSwitch } from "@/components/layout/zone-switch";
import { HomeListSkeleton, HomeShortcutBone } from "@/components/home/home-skeleton";
import { ShortcutCard } from "@/components/home/shortcut-card";
import { AlbumRow } from "@/components/library/album-row";
import { AlbumTile } from "@/components/library/album-tile";
import { LibrarySortSheet, librarySortLabel } from "@/components/library/library-sort-sheet";
import { LibraryTile } from "@/components/library/library-tile";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { ContinueWatching } from "@/components/video/continue-watching";
import { albumHref } from "@/lib/library/href";
import { useTrackArtwork } from "@/hooks/use-cover-url";
import { useBrowsePrefs } from "@/hooks/use-browse-prefs";
import { useExitingList } from "@/hooks/use-exiting-list";
import { useHome } from "@/hooks/use-home";
import type { Track } from "@/lib/nas/types";
import { isPodcastFolderName, isPodcastTrack, isSongsFolderName } from "@/lib/nas/webdav";
import { usePlayer } from "@/lib/player/player-context";
import { useTrackActions } from "@/lib/player/track-actions-context";
import { usePlaylistActions } from "@/lib/spotify/playlist-actions-context";
import { useSpotify } from "@/lib/spotify/spotify-context";
import { colors, fonts, type } from "@/lib/theme";
import { useZone } from "@/lib/zone/zone-context";

const SHORTCUT_SLOTS = 8;

function isGenericPodcastBucket(name: string): boolean {
  return isPodcastFolderName(name);
}

export default function HomeScreen() {
  const router = useRouter();
  const { recents, musicAlbums, podcastAlbums, loading, error, refresh } = useHome();
  const { playlists } = useSpotify();
  const { openPlaylistActions } = usePlaylistActions();
  const { playTracks } = usePlayer();
  const { zone } = useZone();
  const [sortOpen, setSortOpen] = useState(false);
  const { sort, viewMode, setSort, setViewMode, ready: browseReady } = useBrowsePrefs("nlc.home.browse.v1");
  const grid = viewMode === "grid";
  const podcast = zone === "podcast";
  const video = zone === "video";
  const focus = zone === "focus";
  const wealth = zone === "wealth";
  const albums = podcast ? podcastAlbums : musicAlbums;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const scopedRecents = useMemo(
    () =>
      video
        ? []
        : recents.filter((track) => (podcast ? isPodcastTrack(track) : !isPodcastTrack(track))),
    [podcast, recents, video],
  );

  const shortcuts = useMemo(() => {
    const items: {
      key: string;
      id: string;
      title: string;
      coverId?: string | null;
      uri?: string | null;
      liked?: boolean;
      podcast?: boolean;
      music?: boolean;
      video?: boolean;
      onPress: () => void;
      onLongPress?: () => void;
    }[] = video
      ? [
          {
            key: "videos",
            id: "videos",
            title: "Vídeos",
            video: true,
            onPress: () => router.push("/videos"),
          },
          {
            key: "favorites-video",
            id: "favorites-video",
            title: "Favoritos vídeo",
            liked: true,
            video: true,
            onPress: () => router.push({ pathname: "/favorites", params: { kind: "video" } }),
          },
        ]
      : podcast
        ? [
            {
              key: "podcasts",
              id: "podcasts",
              title: "Podcasts",
              podcast: true,
              onPress: () => router.push("/podcasts"),
            },
            {
              key: "favorites-podcast",
              id: "favorites-podcast",
              title: "Favoritos podcast",
              liked: true,
              podcast: true,
              onPress: () => router.push({ pathname: "/favorites", params: { kind: "podcast" } }),
            },
          ]
        : [
            {
              key: "music",
              id: "music",
              title: "Música",
              music: true,
              onPress: () => router.push("/music"),
            },
            {
              key: "favorites-music",
              id: "favorites-music",
              title: "Favoritos música",
              liked: true,
              onPress: () => router.push({ pathname: "/favorites", params: { kind: "music" } }),
            },
          ];

    if (!podcast && !video) {
      for (const playlist of playlists) {
        if (!playlist.liked) continue;
        if (items.length >= SHORTCUT_SLOTS) break;
        items.push({
          key: `playlist-${playlist.id}`,
          id: playlist.id,
          title: playlist.name,
          uri: playlist.coverUrl,
          onPress: () => router.push(`/imported/${playlist.id}`),
          onLongPress: () => openPlaylistActions(playlist),
        });
      }
    }

    if (!video && !podcast) {
      for (const album of albums) {
        if (items.length >= SHORTCUT_SLOTS) break;
        items.push({
          key: `album-${album.id}`,
          id: album.id,
          title: album.name,
          coverId: album.coverId,
          onPress: () => router.push(albumHref(album.id)),
        });
      }
    }

    return items;
  }, [albums, openPlaylistActions, playlists, podcast, router, video]);

  const showSkeleton = !video && loading && albums.length === 0 && scopedRecents.length === 0;
  const gridAlbumIds = new Set(
    shortcuts.filter((item) => item.key.startsWith("album-")).map((item) => item.id),
  );
  const moreAlbums = albums.filter((album) => {
    if (gridAlbumIds.has(album.id)) return false;
    if (podcast && isGenericPodcastBucket(album.name)) return false;
    if (!podcast && isSongsFolderName(album.name)) return false;
    return true;
  });

  const sortedRecents = useMemo(() => {
    const next = [...scopedRecents];
    if (sort === "alpha") next.sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
    else if (sort === "creator") {
      next.sort((a, b) => a.artistName.localeCompare(b.artistName, "es", { sensitivity: "base" }));
    }
    return next;
  }, [scopedRecents, sort]);
  const homeTracks = useMemo(() => sortedRecents.slice(0, 6), [sortedRecents]);
  const { items: visibleHomeTracks, isExiting } = useExitingList(homeTracks);

  const sortedAlbums = useMemo(() => {
    const recentAlbumIds = new Set(sortedRecents.map((track) => track.albumId));
    const recentTitles = new Set(sortedRecents.map((track) => track.title.trim().toLowerCase()));
    const next = moreAlbums.filter((album) => {
      if (recentAlbumIds.has(album.id)) return false;
      if (podcast && recentTitles.has(album.name.trim().toLowerCase())) return false;
      return true;
    });
    if (sort === "alpha") next.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    else if (sort === "creator") {
      next.sort((a, b) => a.artistName.localeCompare(b.artistName, "es", { sensitivity: "base" }));
    } else if (sort === "added") next.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return next;
  }, [moreAlbums, podcast, sort, sortedRecents]);

  if (wealth) return <WealthHome />;
  if (focus) return <FocusHome />;

  return (
    <>
      <Screen>
        <View style={styles.hero}>
          <LadybugMark />
          <ZoneSwitch />
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
              podcast={item.podcast}
              music={item.music}
              video={item.video}
              onPress={item.onPress}
              onLongPress={item.onLongPress}
            />
          ))}
          {showSkeleton
            ? Array.from({ length: Math.max(0, SHORTCUT_SLOTS - shortcuts.length) }, (_, index) => (
                <HomeShortcutBone key={`shortcut-bone-${index}`} />
              ))
            : null}
        </View>

        {video ? <ContinueWatching /> : null}

        {showSkeleton ? <HomeListSkeleton grid={grid} /> : null}

        {!video && browseReady && (scopedRecents.length || moreAlbums.length) ? (
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

        {!video && browseReady && (sortedRecents.length || sortedAlbums.length) ? (
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
                    subtitle={podcast ? "Podcast" : `Álbum · ${album.artistName}`}
                    onPress={() => router.push(albumHref(album.id))}
                  />
                </View>
              ))}
            </View>
          ) : (
            <View>
              {visibleHomeTracks.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index + 1}
                  exiting={isExiting(track.id)}
                  onPress={() => {
                    if (isExiting(track.id)) return;
                    const playIndex = sortedRecents.findIndex((item) => item.id === track.id);
                    if (playIndex < 0) return;
                    void playTracks(sortedRecents, playIndex);
                  }}
                />
              ))}
              {sortedAlbums.map((album) => (
                <AlbumRow key={album.id} album={album} onPress={() => router.push(albumHref(album.id))} />
              ))}
            </View>
          )
        ) : null}
      </Screen>
      <LibrarySortSheet open={sortOpen} value={sort} onOpenChange={setSortOpen} onChange={setSort} />
    </>
  );
}

function HomeTrackTile({ track, onPress }: { track: Track; onPress: () => void }) {
  const cover = useTrackArtwork(track);
  const { openTrackActions } = useTrackActions();
  return (
    <LibraryTile
      id={track.id}
      title={track.title}
      subtitle={track.artistName}
      uri={cover}
      onPress={onPress}
      onLongPress={() => openTrackActions(track)}
    />
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: { flex: 1 },
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
