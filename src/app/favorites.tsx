import { Pressable, StyleSheet, Text, View } from "react-native";
import { Heart } from "lucide-react-native";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { useFavorites } from "@/lib/favorites/favorites-context";
import { usePlayer } from "@/lib/player/player-context";
import { colors, fonts, type } from "@/lib/theme";

export default function FavoritesScreen() {
  const { favorites } = useFavorites();
  const { playTracks, current } = usePlayer();

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.art}>
          <Heart color={colors.accent} fill={colors.accent} size={36} />
        </View>
        <Text style={type.label}>Lista</Text>
        <Text style={type.pageTitle}>Favoritos</Text>
        <Text style={type.meta}>
          {favorites.length ? `${favorites.length} canciones` : "Aún no hay canciones guardadas"}
        </Text>
      </View>

      {favorites.length ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => void playTracks(favorites, 0)}
            style={({ pressed }) => [styles.btn, styles.solid, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.solidText}>Reproducir</Text>
          </Pressable>
          <Pressable
            onPress={() => void playTracks(favorites, Math.floor(Math.random() * favorites.length))}
            style={({ pressed }) => [styles.btn, styles.ghost, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.ghostText}>Aleatorio</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={type.body}>Marca una canción con el corazón mientras suena para guardarla aquí.</Text>
      )}

      {favorites.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index + 1}
          active={current?.id === track.id}
          onPress={() => void playTracks(favorites, index)}
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
    backgroundColor: "#3A2E2E",
    marginBottom: 8,
  },
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
