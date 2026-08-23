import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SeriesRow, seriesListStyle } from "@/components/video/series-row";
import { useSettings } from "@/lib/settings/settings-context";
import { inspectFolder, toVideoEpisode, type VideoListing } from "@/lib/video/browse";
import { watchRoute } from "@/lib/video/onepiece";
import { useVideoActions } from "@/lib/video/video-actions-context";
import { colors, type } from "@/lib/theme";

export function VideoBrowse({ path }: { path: string }) {
  const router = useRouter();
  const { openVideoActions } = useVideoActions();
  const { settings, password, ready } = useSettings();
  const [listing, setListing] = useState<VideoListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setListing(await inspectFolder(settings, password, path));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la carpeta.");
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [password, path, settings]);

  useFocusEffect(
    useCallback(() => {
      if (ready && path) void refresh();
    }, [path, ready, refresh]),
  );

  const folders = listing?.folders ?? [];
  const episodes = listing?.episodes ?? [];

  return (
    <View>
      <View style={styles.header}>
        <Text style={type.label}>{listing?.eyebrow ?? "Vídeo"}</Text>
        <Text style={type.pageTitle}>{listing?.title ?? "…"}</Text>
        <Text style={type.meta}>{loading ? "Cargando…" : listing?.summary}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={seriesListStyle}>
        {folders.map((folder) => (
          <SeriesRow
            key={folder.id}
            index={folder.order < 9_000 ? folder.order : undefined}
            title={folder.title}
            subtitle={folder.subtitle}
            onPress={() => router.push({ pathname: "/video/browse/[id]", params: { id: folder.id } })}
            onLongPress={() =>
              openVideoActions(
                { kind: "folder", id: folder.id, path: folder.path, title: folder.title },
                { onChanged: () => void refresh() },
              )
            }
          />
        ))}
        {episodes.map((episode, index) => (
          <SeriesRow
            key={episode.id}
            index={episode.number < 99_000 ? episode.number : undefined}
            title={episode.title}
            playable
            onPress={() => router.push(watchRoute(episode.path, episode.parentPath))}
            onLongPress={() =>
              openVideoActions(
                { kind: "episode", episode: toVideoEpisode(episode), index },
                { onChanged: () => void refresh() },
              )
            }
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingBottom: 4 },
  error: { ...type.body, color: colors.danger },
});
