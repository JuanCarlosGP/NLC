import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/ui/screen";
import {
  decodeVideoId,
  formatEpisodeRange,
  listOnePieceEpisodes,
  parseArcName,
} from "@/lib/video/onepiece";
import type { VideoEpisode } from "@/lib/video/types";
import { useSettings } from "@/lib/settings/settings-context";
import { colors, fonts, type } from "@/lib/theme";

export default function ArcScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { settings, password, ready } = useSettings();
  const arcPath = decodeVideoId(Array.isArray(id) ? id[0]! : id ?? "");
  const arcName = arcPath.split("/").pop() ?? "";
  const arcMeta = parseArcName(arcName);
  const range = formatEpisodeRange(arcMeta?.episodeStart ?? null, arcMeta?.episodeEnd ?? null);
  const [episodes, setEpisodes] = useState<VideoEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!arcPath) return;
    setLoading(true);
    setError(null);
    try {
      const next = await listOnePieceEpisodes(settings, password, arcPath);
      setEpisodes(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los episodios.");
      setEpisodes([]);
    } finally {
      setLoading(false);
    }
  }, [settings, password, arcPath]);

  useFocusEffect(
    useCallback(() => {
      if (ready && arcPath) void refresh();
    }, [ready, arcPath, refresh]),
  );

  const openEpisode = (episode: VideoEpisode, index: number) => {
    const segments = episode.path.replace(/^\//, "").split("/");
    router.push({
      pathname: "/watch/[...path]",
      params: {
        path: segments,
        arc: encodeURIComponent(arcPath),
        index: String(index),
      },
    });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={type.pageTitle}>{arcMeta?.title ?? arcName}</Text>
        <Text style={type.meta}>
          {loading
            ? "Cargando episodios…"
            : range
              ? `${range} · ${episodes.length} archivos`
              : `${episodes.length} episodios`}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {episodes.map((episode, index) => (
        <Pressable
          key={episode.id}
          onPress={() => openEpisode(episode, index)}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Text style={styles.num}>{String(episode.number).padStart(4, "0")}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {episode.title}
          </Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingBottom: 4 },
  error: { ...type.body, color: colors.danger },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  num: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.muted,
    width: 52,
  },
  title: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
});
