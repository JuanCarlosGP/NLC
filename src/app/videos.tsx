import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Clapperboard } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { SeriesRow, seriesListStyle } from "@/components/video/series-row";
import { useSettings } from "@/lib/settings/settings-context";
import { browseRoute } from "@/lib/video/browse";
import { listVideoShows, type VideoShow } from "@/lib/video/catalog";
import { useVideoActions } from "@/lib/video/video-actions-context";
import { watchRoute } from "@/lib/video/onepiece";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";

export default function VideosScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { settings, password, ready } = useSettings();
  const { openVideoActions } = useVideoActions();
  const [shows, setShows] = useState<VideoShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setShows(await listVideoShows(settings, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("videos.loadError"));
      setShows([]);
    } finally {
      setLoading(false);
    }
  }, [password, settings, t]);

  useFocusEffect(
    useCallback(() => {
      if (ready) void refresh();
    }, [ready, refresh]),
  );

  const series = useMemo(() => shows.filter((show) => show.kind === "series"), [shows]);
  const movies = useMemo(() => shows.filter((show) => show.kind === "movie"), [shows]);

  function openShow(show: VideoShow) {
    if (show.kind === "movie" && show.file) {
      router.push(watchRoute(show.path, show.path.replace(/\/[^/]+$/, "") || show.path));
      return;
    }
    router.push(browseRoute(show.path));
  }

  const countLabel = loading
    ? t("common.loading")
    : shows.length
      ? [
          series.length
            ? t(series.length === 1 ? "videos.seriesOne" : "videos.seriesMany", { count: series.length })
            : "",
          movies.length
            ? t(movies.length === 1 ? "videos.movieOne" : "videos.movieMany", { count: movies.length })
            : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : t("videos.emptyInPath", { path: settings.videoSharePath || "Video" });

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.art}>
          <Clapperboard color={colors.accent} size={36} strokeWidth={1.8} />
        </View>
        <Text style={type.label}>{t("common.list")}</Text>
        <Text style={type.pageTitle}>{t("videos.title")}</Text>
        <Text style={type.meta}>{countLabel}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !shows.length ? (
        <Text style={type.body}>
          {t("videos.emptyInPath", { path: settings.videoSharePath || "/Video" })}
        </Text>
      ) : null}

      {series.length ? (
        <View>
          <Text style={type.sectionTitle}>{t("videos.series")}</Text>
          <View style={seriesListStyle}>
            {series.map((show) => (
              <SeriesRow
                key={show.id}
                title={show.title}
                subtitle={t("videos.seriesKind")}
                onPress={() => openShow(show)}
                onLongPress={() =>
                  openVideoActions(
                    { kind: "folder", id: show.id, path: show.path, title: show.title },
                    { onChanged: refresh },
                  )
                }
              />
            ))}
          </View>
        </View>
      ) : null}

      {movies.length ? (
        <View>
          <Text style={type.sectionTitle}>{t("videos.movies")}</Text>
          <View style={seriesListStyle}>
            {movies.map((show) => (
              <SeriesRow
                key={show.id}
                title={show.title}
                subtitle={t("videos.movieKind")}
                playable={show.file}
                onPress={() => openShow(show)}
                onLongPress={() =>
                  openVideoActions(
                    { kind: "folder", id: show.id, path: show.path, title: show.title },
                    { onChanged: refresh },
                  )
                }
              />
            ))}
          </View>
        </View>
      ) : null}
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
    backgroundColor: "#322A38",
    marginBottom: 8,
  },
  error: { ...type.body, color: colors.danger },
});
