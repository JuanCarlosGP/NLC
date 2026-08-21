import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { AlbumRow } from "@/components/library/album-row";
import { ArtistRow } from "@/components/library/artist-row";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { useSearch } from "@/hooks/use-search";
import { usePlayer } from "@/lib/player/player-context";
import { colors, fonts, type } from "@/lib/theme";

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { results, loading, listTitle } = useSearch(query);
  const { playTracks } = usePlayer();
  const empty =
    !results.artists.length && !results.albums.length && !results.tracks.length && !loading && query.trim();

  return (
    <Screen>
      <Text style={type.pageTitle}>Buscar</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Artista, álbum o pista"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.input}
      />
      {loading ? <Text style={type.meta}>Buscando…</Text> : null}
      {empty ? <Text style={type.body}>Nada en el índice para «{query.trim()}».</Text> : null}

      {results.artists.length ? (
        <View>
          <Text style={type.sectionTitle}>Artistas</Text>
          {results.artists.map((artist) => (
            <ArtistRow
              key={artist.id}
              artist={artist}
              onPress={() => router.push(`/artist/${artist.id}`)}
            />
          ))}
        </View>
      ) : null}

      {results.albums.length ? (
        <View>
          <Text style={type.sectionTitle}>Álbumes</Text>
          {results.albums.map((album) => (
            <AlbumRow key={album.id} album={album} onPress={() => router.push(`/album/${album.id}`)} />
          ))}
        </View>
      ) : null}

      {results.tracks.length ? (
        <View>
          <Text style={type.sectionTitle}>{listTitle}</Text>
          {results.tracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index + 1}
              onPress={() => void playTracks(results.tracks, index)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
