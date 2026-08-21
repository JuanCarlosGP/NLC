import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, SkipForward } from "lucide-react-native";
import type { PlayableSource } from "@/lib/nas/types";
import { usePlayer } from "@/lib/player/player-context";
import { useSettings } from "@/lib/settings/settings-context";
import {
  decodeVideoId,
  episodeStreamUrl,
  listOnePieceEpisodes,
  parseArcName,
} from "@/lib/video/onepiece";
import type { VideoEpisode } from "@/lib/video/types";
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
  const params = useLocalSearchParams<{ path?: string | string[]; arc?: string; index?: string }>();

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
    return parseArcName(name)?.title ?? name;
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

  const videoSource = useMemo(() => {
    if (!current) return null;
    try {
      return toVideoSource(episodeStreamUrl(settings, password, current.path));
    } catch {
      return null;
    }
  }, [current, settings, password]);

  const player = useVideoPlayer(videoSource, (instance) => {
    instance.loop = false;
    instance.play();
  });

  useEffect(() => {
    pause();
  }, [pause]);

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
        const list = await listOnePieceEpisodes(settings, password, arcPath);
        if (cancelled) return;
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
    const sub = player.addListener("playToEnd", () => {
      playNext();
    });
    return () => sub.remove();
  }, [player, playNext]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <StatusBar style="light" hidden />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
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
        {nextEpisode ? (
          <Pressable
            accessibilityLabel="Siguiente episodio"
            onPress={playNext}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <SkipForward color={colors.ink} size={22} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
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
    paddingHorizontal: 8,
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
