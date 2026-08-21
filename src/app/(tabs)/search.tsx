import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Mic, Music2 } from "lucide-react-native";
import { AlbumRow } from "@/components/library/album-row";
import { ArtistRow } from "@/components/library/artist-row";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { useSearch } from "@/hooks/use-search";
import { isPodcastAlbum, isPodcastArtist, isPodcastTrack, isSongsAlbum, isSongsArtist } from "@/lib/nas/webdav";
import { usePlayer } from "@/lib/player/player-context";
import { colors, fonts, type } from "@/lib/theme";

type SearchScope = "music" | "podcast";

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("music");
  const { results, loading } = useSearch(query);
  const { playTracks } = usePlayer();
  const podcast = scope === "podcast";

  const artists = useMemo(
    () =>
      results.artists.filter((artist) =>
        podcast ? isPodcastArtist(artist) : !isPodcastArtist(artist) && !isSongsArtist(artist),
      ),
    [podcast, results.artists],
  );
  const albums = useMemo(
    () =>
      results.albums.filter((album) =>
        podcast ? isPodcastAlbum(album) : !isPodcastAlbum(album) && !isSongsAlbum(album),
      ),
    [podcast, results.albums],
  );
  const tracks = useMemo(
    () => results.tracks.filter((track) => (podcast ? isPodcastTrack(track) : !isPodcastTrack(track))),
    [podcast, results.tracks],
  );

  const empty =
    !artists.length && !albums.length && !tracks.length && !loading && Boolean(query.trim());

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[type.pageTitle, styles.title]}>Buscar</Text>
        <View style={styles.switch}>
          <Pressable
            accessibilityLabel="Canciones"
            accessibilityState={{ selected: !podcast }}
            onPress={() => setScope("music")}
            style={[styles.switchBtn, !podcast && styles.switchBtnActive]}
          >
            <Music2 size={16} color={!podcast ? colors.void : colors.inkSoft} strokeWidth={1.9} />
          </Pressable>
          <Pressable
            accessibilityLabel="Podcasts"
            accessibilityState={{ selected: podcast }}
            onPress={() => setScope("podcast")}
            style={[styles.switchBtn, podcast && styles.switchBtnActive]}
          >
            <Mic size={16} color={podcast ? colors.void : colors.inkSoft} strokeWidth={1.9} />
          </Pressable>
        </View>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={podcast ? "Episodio o podcast" : "Artista, álbum o pista"}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
      />
      {loading ? <Text style={type.meta}>Buscando…</Text> : null}
      {empty ? <Text style={type.body}>Nada en el índice para «{query.trim()}».</Text> : null}

      {artists.length ? (
        <View>
          <Text style={type.sectionTitle}>Artistas</Text>
          {artists.map((artist) => (
            <ArtistRow
              key={artist.id}
              artist={artist}
              onPress={() => router.push(`/artist/${artist.id}`)}
            />
          ))}
        </View>
      ) : null}

      {albums.length ? (
        <View>
          <Text style={type.sectionTitle}>{podcast ? "Podcasts" : "Álbumes"}</Text>
          {albums.map((album) => (
            <AlbumRow key={album.id} album={album} onPress={() => router.push(`/album/${album.id}`)} />
          ))}
        </View>
      ) : null}

      {tracks.length ? (
        <View>
          {tracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index + 1}
              onPress={() => void playTracks(tracks, index)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { flex: 1 },
  switch: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    backgroundColor: colors.sheet,
    padding: 3,
  },
  switchBtn: {
    width: 36,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  switchBtnActive: {
    backgroundColor: colors.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
});
