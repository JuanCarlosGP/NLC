import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlbumRow } from "@/components/library/album-row";
import { Cover } from "@/components/ui/cover";
import { Screen } from "@/components/ui/screen";
import { useArtist } from "@/hooks/use-artist";
import { useCoverUrl } from "@/hooks/use-cover-url";
import { usePlayer } from "@/lib/player/player-context";
import { useSettings } from "@/lib/settings/settings-context";
import { colors, fonts, type } from "@/lib/theme";

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { source } = useSettings();
  const { artist, albums, loading, error, name } = useArtist(id);
  const { playTracks } = usePlayer();
  const cover = useCoverUrl(artist?.coverId ?? albums[0]?.coverId);

  async function playAll() {
    const collected = [];
    for (const album of albums) {
      collected.push(...(await source.getTracks(album.id)));
    }
    if (collected.length) await playTracks(collected, 0);
  }

  return (
    <Screen>
      {loading ? <Text style={type.meta}>Cargando artista…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.header}>
        <Cover id={id ?? name} label={name} uri={cover} size={96} radius={48} />
        <Text style={type.pageTitle}>{name}</Text>
        <Text style={type.meta}>{albums.length} álbumes</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => void playAll()}
          style={({ pressed }) => [styles.btn, styles.solid, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.solidText}>Reproducir</Text>
        </Pressable>
        <Pressable
          onPress={() => void playAll()}
          style={({ pressed }) => [styles.btn, styles.ghost, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.ghostText}>Álbumes</Text>
        </Pressable>
      </View>
      {albums.map((album) => (
        <AlbumRow key={album.id} album={album} onPress={() => router.push(`/album/${album.id}`)} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { ...type.body, color: colors.danger },
  header: { gap: 8, alignItems: "flex-start" },
  actions: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8 },
  solid: { backgroundColor: colors.accent },
  ghost: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheet },
  solidText: { fontFamily: fonts.sansSemiBold, color: colors.accentText },
  ghostText: { fontFamily: fonts.sansSemiBold, color: colors.ink },
});
