import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Mic } from "lucide-react-native";
import { AlbumRow } from "@/components/library/album-row";
import { TrackRow } from "@/components/library/track-row";
import { Screen } from "@/components/ui/screen";
import { getAlbum, getAlbums, getTracks } from "@/lib/db/catalog";
import { nasScanOk } from "@/lib/db/from-source";
import { albumHref } from "@/lib/library/href";
import type { Album, Track } from "@/lib/nas/types";
import { usePlayer } from "@/lib/player/player-context";
import { useSettings } from "@/lib/settings/settings-context";
import { colors, fonts, type } from "@/lib/theme";

export default function PodcastsScreen() {
  const router = useRouter();
  const { source, ready, settings } = useSettings();
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
      const podcasts = await getAlbums({ home: "podcast", offlineOnly });
      setAlbums(podcasts);
      if (podcasts.length === 1) {
        const detail = await getAlbum(podcasts[0]!.id, offlineOnly);
        setTracks(detail?.tracks ?? []);
      } else if (!podcasts.length) {
        // yt-dlp dumps land as one file per album (podcast_episode), not as shows.
        setTracks(await getTracks({ kind: "podcast", offlineOnly }));
      } else {
        setTracks([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los podcasts.");
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

  const episodeCount = useMemo(() => {
    if (tracks.length) return tracks.length;
    return albums.reduce((sum, album) => sum + (album.trackCount ?? 0), 0);
  }, [albums, tracks]);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.art}>
          <Mic color={colors.accent} size={36} strokeWidth={1.8} />
        </View>
        <Text style={type.label}>Lista</Text>
        <Text style={type.pageTitle}>Podcasts</Text>
        <Text style={type.meta}>
          {loading
            ? "Cargando…"
            : episodeCount
              ? `${episodeCount} episodios`
              : `Aún no hay episodios en ${settings.podcastSharePath || "Music/Podcasts"}`}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !albums.length && !tracks.length ? (
        <Text style={type.body}>
          Descarga un episodio en Ajustes → Descargar. Quedará en{" "}
          {settings.podcastSharePath || "Music/Podcasts"}.
        </Text>
      ) : null}

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
            subtitle="Podcast"
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
    backgroundColor: "#2A322E",
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
