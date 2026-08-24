import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
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

type VideoSrc = { uri: string; headers?: Record<string, string> };

/** Same timeout Media3 uses for native play/pause chrome. */
const CHROME_HIDE_MS = 5000;
const CHROME_FADE_MS = 200;

function toVideoSource(source: PlayableSource): VideoSrc {
  if (typeof source === "string") return { uri: source };
  const headers = source.headers
    ? Object.fromEntries(Object.entries(source.headers).filter((entry): entry is [string, string] => Boolean(entry[1])))
    : undefined;
  return headers && Object.keys(headers).length ? { uri: source.uri, headers } : { uri: source.uri };
}

class PlayerBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.center}>
        <Text style={styles.error}>
          No se pudo reproducir este episodio.
          {"\n"}
          {this.state.error.message}
        </Text>
      </View>
    );
  }
}

function WatchChrome({
  visible,
  children,
  paddingTop,
  paddingLeft,
  paddingRight,
}: {
  visible: boolean;
  children: ReactNode;
  paddingTop: number;
  paddingLeft: number;
  paddingRight: number;
}) {
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: CHROME_FADE_MS });
  }, [opacity, visible]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      style={[
        styles.topBar,
        fadeStyle,
        { paddingTop, paddingLeft, paddingRight },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function EpisodePlayer({
  source,
  path,
  startAt,
  onEnded,
  onPlayingChange,
}: {
  source: VideoSrc;
  path: string;
  startAt: number;
  onEnded: () => void;
  onPlayingChange: (playing: boolean) => void;
}) {
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 2;
  });
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const playingRef = useRef(onPlayingChange);
  playingRef.current = onPlayingChange;

  useEffect(() => {
    try {
      player.play();
    } catch {
      // Native player may reject before the view is attached.
    }
  }, [player]);

  useEffect(() => {
    playingRef.current(player.playing);
    const sub = player.addListener("playingChange", ({ isPlaying }) => {
      playingRef.current(isPlaying);
    });
    return () => {
      sub.remove();
      playingRef.current(false);
    };
  }, [player]);

  useEffect(() => {
    const saved = peekWatchForPath(path);
    const target = startAt > 3 ? startAt : saved?.path === path && saved.positionSec > 3 ? saved.positionSec : 0;
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
  }, [path, player, startAt]);

  useEffect(() => {
    const timeSub = player.addListener("timeUpdate", ({ currentTime }) => {
      updateWatchProgress(currentTime, player.duration);
    });
    const endSub = player.addListener("playToEnd", () => {
      const duration = player.duration || 1;
      void flushWatchProgress(duration, duration, path);
      endedRef.current();
    });
    return () => {
      timeSub.remove();
      endSub.remove();
    };
  }, [path, player]);

  useEffect(() => {
    return () => {
      try {
        void flushWatchProgress(player.currentTime, player.duration, path);
      } catch {
        // Native player may already be released.
      }
    };
  }, [path, player]);

  return (
    <VideoView
      style={styles.video}
      player={player}
      allowsFullscreen
      allowsPictureInPicture
      contentFit="contain"
      nativeControls
    />
  );
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

  const startAt = useMemo(() => {
    const raw = Array.isArray(params.start) ? params.start[0] : params.start;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 3 ? n : 0;
  }, [params.start]);

  const [videoSource, setVideoSource] = useState<{ path: string; src: VideoSrc } | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [playing, setPlaying] = useState(false);

  const onPlayingChange = useCallback((value: boolean) => {
    setPlaying(value);
  }, []);

  useEffect(() => {
    if (!current) {
      setVideoSource(null);
      return;
    }
    const path = current.path;
    setVideoSource((prev) => (prev?.path === path ? prev : null));
    let cancelled = false;
    void episodeStreamUrl(settings, password, path)
      .then((source) => {
        if (!cancelled) setVideoSource({ path, src: toVideoSource(source) });
      })
      .catch(() => {
        if (!cancelled) setVideoSource(null);
      });
    return () => {
      cancelled = true;
    };
  }, [current, settings, password]);

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

  const resumeAt = current && current.path === initialPath ? startAt : 0;
  const videoReady = Boolean(ready && current && videoSource && videoSource.path === current.path);
  const showChrome = !videoReady || chromeVisible || Boolean(bootError);

  useEffect(() => {
    setChromeVisible(true);
    setPlaying(false);
  }, [current?.path]);

  useEffect(() => {
    if (!videoReady || !chromeVisible || !playing) return;
    const timer = setTimeout(() => setChromeVisible(false), CHROME_HIDE_MS);
    return () => clearTimeout(timer);
  }, [videoReady, chromeVisible, playing, current?.path]);

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
      <WatchChrome
        visible={showChrome}
        paddingTop={insets.top + 8}
        paddingLeft={insets.left + 8}
        paddingRight={insets.right + 8}
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
      </WatchChrome>

      <View style={styles.stage}>
        {!ready || !current || !videoSource || videoSource.path !== current.path ? (
          <View style={styles.center}>
            {bootError ? (
              <Text style={styles.error}>{bootError}</Text>
            ) : (
              <ActivityIndicator color={colors.accent} />
            )}
          </View>
        ) : (
          <PlayerBoundary resetKey={current.path}>
            <EpisodePlayer
              key={current.path}
              source={videoSource.src}
              path={current.path}
              startAt={resumeAt}
              onEnded={playNext}
              onPlayingChange={onPlayingChange}
            />
          </PlayerBoundary>
        )}
      </View>
      {videoReady && !showChrome ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mostrar controles"
          onPress={() => setChromeVisible(true)}
          style={styles.tapCatch}
        />
      ) : null}
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
  tapCatch: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
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
