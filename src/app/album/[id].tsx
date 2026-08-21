import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TrackRow } from "@/components/library/track-row";
import { Cover } from "@/components/ui/cover";
import { Screen } from "@/components/ui/screen";
import { useAlbum } from "@/hooks/use-album";
import { useCoverUrl } from "@/hooks/use-cover-url";
import { isPodcastAlbum } from "@/lib/nas/webdav";
import { usePlayer } from "@/lib/player/player-context";
import { colors, fonts, type } from "@/lib/theme";

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { album, loading, error } = useAlbum(id);
  const { playTracks, current } = usePlayer();
  const cover = useCoverUrl(album?.coverId);
  const podcast = album ? isPodcastAlbum(album) : false;

  return (
    <Screen>
      {loading ? <Text style={type.meta}>Cargando álbum…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {album ? (
        <>
          <View style={styles.header}>
            <Cover id={album.id} label={album.name} uri={cover} size={160} radius={4} />
            <Text style={type.pageTitle}>{album.name}</Text>
            {podcast ? (
              <Text style={type.body}>Podcast</Text>
            ) : (
              <Pressable onPress={() => router.push(`/artist/${album.artistId}`)}>
                <Text style={type.body}>{album.artistName}</Text>
              </Pressable>
            )}
            <Text style={type.meta}>
              {album.year ? `${album.year} · ` : ""}
              {album.tracks.length} {podcast ? "episodios" : "pistas"}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => void playTracks(album.tracks, 0)}
              style={({ pressed }) => [styles.btn, styles.solid, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.solidText}>Reproducir</Text>
            </Pressable>
            <Pressable
              onPress={() => void playTracks(album.tracks, Math.floor(Math.random() * album.tracks.length))}
              style={({ pressed }) => [styles.btn, styles.ghost, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.ghostText}>Aleatorio</Text>
            </Pressable>
          </View>
          {album.tracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={track.track ?? index + 1}
              active={current?.id === track.id}
              onPress={() => void playTracks(album.tracks, index)}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { ...type.body, color: colors.danger },
  header: { gap: 8, paddingBottom: 8 },
  actions: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8 },
  solid: { backgroundColor: colors.accent },
  ghost: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheet },
  solidText: { fontFamily: fonts.sansSemiBold, color: colors.accentText },
  ghostText: { fontFamily: fonts.sansSemiBold, color: colors.ink },
});
