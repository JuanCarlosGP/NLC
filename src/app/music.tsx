import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Music2 } from "lucide-react-native";
import { AlbumRow } from "@/components/library/album-row";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { getAlbum, getAlbums } from "@/lib/db/catalog";
import { nasScanOk } from "@/lib/db/from-source";
import { albumHref } from "@/lib/library/href";
import { isLooseSongsAlbum, isPodcastAlbum } from "@/lib/nas/webdav";
import type { Album, Track } from "@/lib/nas/types";
import { usePlayer } from "@/lib/player/player-context";
import { useSettings } from "@/lib/settings/settings-context";
import { colors, fonts, type } from "@/lib/theme";

export default function MusicScreen() {
  const router = useRouter();
  const { source, ready } = useSettings();
  const { playTracks, current } = usePlayer();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offlineOnly = !(await nasScanOk(source));
      const all = await getAlbums({ offlineOnly });
      const loose = all.filter(isLooseSongsAlbum);
      const music = all.filter((album) => !isPodcastAlbum(album) && !isLooseSongsAlbum(album));
      setAlbums(music);
      if (!music.length && loose.length) {
        const details = await Promise.all(loose.map((album) => getAlbum(album.id, offlineOnly)));
        setTracks(details.flatMap((detail) => detail?.tracks ?? []));
      } else if (music.length === 1 && !loose.length) {
        const detail = await getAlbum(music[0]!.id, offlineOnly);
        setTracks(detail?.tracks ?? []);
      } else {
        setTracks([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la música.");
    } finally {
      setLoading(false);
    }
  }, [source]);

  useFocusEffect(
    useCallback(() => {
      if (ready) void refresh();
    }, [ready, refresh]),
  );

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  const trackCount = useMemo(() => {
    if (tracks.length) return tracks.length;
    return albums.reduce((sum, album) => sum + (album.trackCount ?? 0), 0);
  }, [albums, tracks]);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.art}>
          <Music2 color={colors.accent} size={36} strokeWidth={1.8} />
        </View>
        <Text style={type.pageTitle}>Música</Text>
        <Text style={type.meta}>
          {loading
            ? "Cargando…"
            : trackCount
              ? `${trackCount} canciones`
              : "Aún no hay canciones en el NAS"}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {tracks.length ? (
        <>
          <View style={styles.actions}>
            <Pressable
              onPress={() => void playTracks(tracks, 0)}
              style={({ pressed }) => [styles.btn, styles.solid, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.solidText}>Reproducir</Text>
            </Pressable>
            <Pressable
              onPress={() => void playTracks(tracks, Math.floor(Math.random() * tracks.length))}
              style={({ pressed }) => [styles.btn, styles.ghost, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.ghostText}>Aleatorio</Text>
            </Pressable>
          </View>
          {tracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index + 1}
              active={current?.id === track.id}
              onPress={() => void playTracks(tracks, index)}
            />
          ))}
        </>
      ) : (
        albums.map((album) => (
          <AlbumRow
            key={album.id}
            album={album}
            subtitle={`Álbum · ${album.artistName}`}
            onPress={() => router.push(albumHref(album.id))}
          />
        ))
      )}
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
    backgroundColor: "#2A3038",
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
  error: { ...type.body, color: colors.danger },
});
