import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, RotateCw, SkipForward } from "lucide-react-native";
import type { PlayableSource } from "@/lib/nas/types";
import { usePlayer } from "@/lib/player/player-context";
import { useSettings } from "@/lib/settings/settings-context";
import { episodeLocation, inspectFolder, seriesFromPath, toVideoEpisode } from "@/lib/video/browse";
import { decodeVideoId, episodeStreamUrl } from "@/lib/video/onepiece";
import { useWatchOrientation } from "@/lib/video/use-watch-orientation";
import {
  flushWatchProgress,
  loadWatchHistory,
  markWatching,
  peekWatchForPath,
  updateWatchProgress,
} from "@/lib/video/watch-history";
import type { VideoEpisode } from "@/lib/video/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

function toVideoSource(source: PlayableSource) {
  if (typeof source === "string") return { uri: source };
  return { uri: source.uri, headers: source.headers };
}

export default function WatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, password } = useSettings();
  const { pause } = usePlayer();
  const { landscape, toggleLandscape } = useWatchOrientation();
  const params = useLocalSearchParams<{
    path?: string | string[];
    arc?: string;
    index?: string;
    start?: string;
  }>();

  const pathSegments = useMemo(() => {
    const raw = params.path;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }, [params.path]);

  const initialPath = useMemo(() => {
    if (!pathSegments.length) return "";
    return `/${pathSegments.map((part) => decodeURIComponent(part)).join("/")}`;
  }, [pathSegments]);

  const arcPath = useMemo(() => {
    const raw = Array.isArray(params.arc) ? params.arc[0] : params.arc;
    return raw ? decodeVideoId(raw) : "";
  }, [params.arc]);

  const arcTitle = useMemo(() => {
    const name = arcPath.split("/").pop() ?? "";
    return name.replace(/[-_]+/g, " ");
  }, [arcPath]);

  const [episodes, setEpisodes] = useState<VideoEpisode[]>([]);
  const [index, setIndex] = useState(() => {
    const raw = Array.isArray(params.index) ? params.index[0] : params.index;
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  });
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const current = episodes[index] ?? null;
  const nextEpisode = episodes[index + 1] ?? null;
  const currentRef = useRef(current);
  currentRef.current = current;

  const startAt = useMemo(() => {
    const raw = Array.isArray(params.start) ? params.start[0] : params.start;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 3 ? n : 0;
  }, [params.start]);

  const [videoSource, setVideoSource] = useState<ReturnType<typeof toVideoSource> | null>(null);

  useEffect(() => {
    if (!current) {
      setVideoSource(null);
      return;
    }
    let cancelled = false;
    void episodeStreamUrl(settings, password, current.path)
      .then((source) => {
        if (!cancelled) setVideoSource(toVideoSource(source));
      })
      .catch(() => {
        if (!cancelled) setVideoSource(null);
      });
    return () => {
      cancelled = true;
    };
  }, [current, settings, password]);

  const player = useVideoPlayer(videoSource, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 2;
    instance.play();
  });

  useEffect(() => {
    pause();
  }, [pause]);

  useEffect(() => {
    void loadWatchHistory();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!arcPath) {
        if (initialPath) {
          setEpisodes([
            {
              id: encodeURIComponent(initialPath),
              path: initialPath,
              number: Number(initialPath.match(/(\d+)(?:\.\w+)?$/)?.[1] ?? 0),
              title: "Episodio",
              arcPath: "",
            },
          ]);
          setIndex(0);
          setReady(true);
        }
        return;
      }
      try {
        const listing = await inspectFolder(settings, password, arcPath);
        if (cancelled) return;
        const list = listing.episodes.map(toVideoEpisode);
        setEpisodes(list);
        const fromPath = list.findIndex((ep) => ep.path === initialPath);
        if (fromPath >= 0) setIndex(fromPath);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setBootError(err instanceof Error ? err.message : "No se pudo abrir el episodio.");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [arcPath, initialPath, settings, password]);

  useEffect(() => {
    if (!videoSource) return;
    const run = async () => {
      try {
        if (typeof player.replaceAsync === "function") {
          await player.replaceAsync(videoSource);
        } else {
          player.replace(videoSource);
        }
        player.play();
      } catch {
        // Native player may reject mid-unmount.
      }
    };
    void run();
  }, [videoSource, player]);

  const playNext = useCallback(() => {
    if (!nextEpisode) return;
    setIndex((value) => value + 1);
  }, [nextEpisode]);

  useEffect(() => {
    if (!current) return;
    const location = episodeLocation(current.path);
    const series = seriesFromPath(current.path);
    void markWatching({
      seriesId: series.id,
      seriesTitle: series.title,
      path: current.path,
      arcPath: current.arcPath || location.arcPath,
      sagaPath: location.sagaPath,
      number: current.number,
      title: current.title,
      arcTitle: location.arcTitle,
      sagaTitle: location.sagaTitle,
      positionSec: startAt,
      durationSec: 0,
    });
  }, [current, startAt]);

  useEffect(() => {
    if (!current) return;
    const saved = peekWatchForPath(current.path);
    const target =
      startAt || (saved?.path === current.path && saved.positionSec > 3 ? saved.positionSec : 0);
    if (target < 3) return;
    let applied = false;
    const seek = () => {
      if (applied) return;
      const duration = player.duration;
      if (duration > 0 && target >= duration - 2) return;
      try {
        player.currentTime = target;
        applied = true;
      } catch {
        // Native player may not be ready yet.
      }
    };
    const sub = player.addListener("sourceLoad", seek);
    const timer = setTimeout(seek, 700);
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [current, player, startAt]);

  useEffect(() => {
    const timeSub = player.addListener("timeUpdate", ({ currentTime }) => {
      updateWatchProgress(currentTime, player.duration);
    });
    const endSub = player.addListener("playToEnd", () => {
      const episode = currentRef.current;
      if (episode) {
        const duration = player.duration || 1;
        void flushWatchProgress(duration, duration, episode.path);
      }
      playNext();
    });
    return () => {
      timeSub.remove();
      endSub.remove();
    };
  }, [player, playNext]);

  useEffect(() => {
    return () => {
      const episode = currentRef.current;
      void flushWatchProgress(player.currentTime, player.duration, episode?.path);
    };
  }, [player]);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: "fade",
          orientation: landscape ? "landscape" : "portrait_up",
        }}
      />
      <StatusBar style="light" hidden />
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 8,
            paddingLeft: insets.left + 8,
            paddingRight: insets.right + 8,
          },
        ]}
      >
        <Pressable
          accessibilityLabel="Cerrar"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ChevronLeft color={colors.ink} size={26} strokeWidth={2} />
        </Pressable>
        <View style={styles.headMeta}>
          <Text style={styles.headTitle} numberOfLines={1}>
            {current ? current.title : "Reproduciendo…"}
          </Text>
          {arcTitle ? (
            <Text style={styles.headSub} numberOfLines={1}>
              {arcTitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={landscape ? "Volver a vertical" : "Ver en horizontal"}
          accessibilityState={{ selected: landscape }}
          onPress={() => {
            triggerUiHaptic();
            toggleLandscape();
          }}
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <RotateCw color={landscape ? colors.accent : colors.ink} size={22} strokeWidth={2} />
        </Pressable>
        {nextEpisode ? (
          <Pressable
            accessibilityLabel="Siguiente episodio"
            onPress={playNext}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <SkipForward color={colors.ink} size={22} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.stage}>
        {!ready || !videoSource ? (
          <View style={styles.center}>
            {bootError ? (
              <Text style={styles.error}>{bootError}</Text>
            ) : (
              <ActivityIndicator color={colors.accent} />
            )}
          </View>
        ) : (
          <VideoView
            style={styles.video}
            player={player}
            allowsFullscreen
            allowsPictureInPicture
            contentFit="contain"
            nativeControls
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headMeta: { flex: 1, gap: 2 },
  headTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.ink,
  },
  headSub: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.inkSoft,
  },
  stage: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.danger,
    textAlign: "center",
  },
});
