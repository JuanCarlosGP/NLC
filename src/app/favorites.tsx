import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Heart } from "lucide-react-native";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { useFavorites } from "@/lib/favorites/favorites-context";
import { isPodcastTrack } from "@/lib/nas/webdav";
import { usePlayer } from "@/lib/player/player-context";
import { colors, fonts, type } from "@/lib/theme";

type FavoritesKind = "music" | "podcast";

function parseKind(raw: string | string[] | undefined): FavoritesKind {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "podcast" ? "podcast" : "music";
}

export default function FavoritesScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind = parseKind(kindParam);
  const podcast = kind === "podcast";
  const { favorites } = useFavorites();
  const { playTracks, current } = usePlayer();

  const list = useMemo(
    () => favorites.filter((track) => (podcast ? isPodcastTrack(track) : !isPodcastTrack(track))),
    [favorites, podcast],
  );

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

      {list.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index + 1}
          active={current?.id === track.id}
          onPress={() => void playTracks(list, index)}
        />
      ))}
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
