import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Heart } from "lucide-react-native";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { SeriesRow, seriesListStyle } from "@/components/video/series-row";
import { useExitingList } from "@/hooks/use-exiting-list";
import { useVideoFavorites } from "@/hooks/use-video-favorites";
import { useFavorites } from "@/lib/favorites/favorites-context";
import { isPodcastTrack } from "@/lib/nas/webdav";
import { usePlayer } from "@/lib/player/player-context";
import { browseRoute } from "@/lib/video/browse";
import { useVideoActions } from "@/lib/video/video-actions-context";
import { watchRoute } from "@/lib/video/onepiece";
import { colors, fonts, type } from "@/lib/theme";

type FavoritesKind = "music" | "podcast" | "video";

function parseKind(raw: string | string[] | undefined): FavoritesKind {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "podcast" || value === "video") return value;
  return "music";
}

export default function FavoritesScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind = parseKind(kindParam);
  if (kind === "video") return <VideoFavorites />;
  return <AudioFavorites kind={kind} />;
}

function AudioFavorites({ kind }: { kind: "music" | "podcast" }) {
  const podcast = kind === "podcast";
  const { favorites } = useFavorites();
  const { playTracks, current } = usePlayer();

  const list = useMemo(
    () => favorites.filter((track) => (podcast ? isPodcastTrack(track) : !isPodcastTrack(track))),
    [favorites, podcast],
  );
  const { items: visibleList, isExiting } = useExitingList(list);

  const title = podcast ? "Favoritos podcast" : "Favoritos música";
  const emptyHint = podcast
    ? "Marca un episodio con el corazón mientras suena para guardarlo aquí."
    : "Marca una canción con el corazón mientras suena para guardarla aquí.";
  const countLabel = podcast
    ? list.length
      ? `${list.length} episodios`
      : "Aún no hay episodios guardados"
    : list.length
      ? `${list.length} canciones`
      : "Aún no hay canciones guardadas";

  return (
    <Screen>
      <View style={styles.header}>
        <View style={[styles.art, podcast ? styles.artPodcast : styles.artMusic]}>
          <Heart color={colors.accent} fill={colors.accent} size={36} />
        </View>
        <Text style={type.label}>Lista</Text>
        <Text style={type.pageTitle}>{title}</Text>
        <Text style={type.meta}>{countLabel}</Text>
      </View>

      {list.length ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => void playTracks(list, 0)}
            style={({ pressed }) => [styles.btn, styles.solid, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.solidText}>Reproducir</Text>
          </Pressable>
          <Pressable
            onPress={() => void playTracks(list, Math.floor(Math.random() * list.length))}
            style={({ pressed }) => [styles.btn, styles.ghost, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.ghostText}>Aleatorio</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={type.body}>{emptyHint}</Text>
      )}

      {visibleList.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index + 1}
          active={current?.id === track.id}
          exiting={isExiting(track.id)}
          onPress={() => {
            if (isExiting(track.id)) return;
            const playIndex = list.findIndex((item) => item.id === track.id);
            if (playIndex < 0) return;
            void playTracks(list, playIndex);
          }}
        />
      ))}
    </Screen>
  );
}

function VideoFavorites() {
  const router = useRouter();
  const { favorites, refresh } = useVideoFavorites();
  const { openVideoActions } = useVideoActions();
  const series = favorites.filter((item) => item.kind === "series");
  const movies = favorites.filter((item) => item.kind === "movie");

  function openShow(path: string, kind: "series" | "movie", file?: boolean) {
    if (kind === "movie" && file) {
      router.push(watchRoute(path, path.replace(/\/[^/]+$/, "") || path));
      return;
    }
    router.push(browseRoute(path));
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={[styles.art, styles.artVideo]}>
          <Heart color={colors.accent} fill={colors.accent} size={36} />
        </View>
        <Text style={type.label}>Lista</Text>
        <Text style={type.pageTitle}>Favoritos vídeo</Text>
        <Text style={type.meta}>
          {favorites.length
            ? `${favorites.length} ${favorites.length === 1 ? "título" : "títulos"}`
            : "Aún no hay vídeos guardados"}
        </Text>
      </View>

      {!favorites.length ? (
        <Text style={type.body}>
          Mantén pulsada una serie o película y márcala con el corazón para guardarla aquí.
        </Text>
      ) : null}

      {series.length ? (
        <View>
          <Text style={type.sectionTitle}>Series</Text>
          <View style={seriesListStyle}>
            {series.map((show) => (
              <SeriesRow
                key={show.path}
                title={show.title}
                subtitle="Serie"
                onPress={() => openShow(show.path, show.kind, show.file)}
                onLongPress={() =>
                  openVideoActions(
                    { kind: "folder", id: show.id, path: show.path, title: show.title },
                    { onChanged: refresh },
                  )
                }
              />
            ))}
          </View>
        </View>
      ) : null}

      {movies.length ? (
        <View>
          <Text style={type.sectionTitle}>Películas</Text>
          <View style={seriesListStyle}>
            {movies.map((show) => (
              <SeriesRow
                key={show.path}
                title={show.title}
                subtitle="Película"
                playable={show.file}
                onPress={() => openShow(show.path, show.kind, show.file)}
                onLongPress={() =>
                  openVideoActions(
                    { kind: "folder", id: show.id, path: show.path, title: show.title },
                    { onChanged: refresh },
                  )
                }
              />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingTop: 8 },
  art: {
    width: 96,
    height: 96,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  artMusic: { backgroundColor: "#3A2E2E" },
  artPodcast: { backgroundColor: "#2E3A32" },
  artVideo: { backgroundColor: "#3A2E38" },
  actions: { flexDirection: "row", gap: 10 },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  solid: { backgroundColor: colors.accent },
  ghost: { borderWidth: 1, borderColor: colors.rule },
  solidText: { fontFamily: fonts.sansMedium, color: colors.accentText, fontSize: 14 },
  ghostText: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 14 },
});
