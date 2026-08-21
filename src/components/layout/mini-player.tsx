import { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Heart, Pause, Play } from "lucide-react-native";
import { Cover } from "@/components/ui/cover";
import { useCoverUrl } from "@/hooks/use-cover-url";
import { DOCK_HEIGHT, DOCK_MARGIN, useDock } from "@/lib/dock-context";
import { useFavorites } from "@/lib/favorites/favorites-context";
import type { Track } from "@/lib/nas/types";
import { usePlayer } from "@/lib/player/player-context";
import { usePlayerUi } from "@/lib/player/player-ui-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { USE_NATIVE_DRIVER } from "@/lib/use-native-driver";
import { colors, fonts, layout } from "@/lib/theme";

const GLASS_FILL = "rgba(14, 13, 12, 0.94)";
const SWIPE_DISTANCE = 52;
const SWIPE_VELOCITY = 650;
const SWIPE_DOWN = 40;
const SWIPE_DOWN_VELOCITY = 550;
const TAP_SLOP = 24;
const LONG_PRESS_MS = 400;
const PAN_SPRING = { damping: 22, stiffness: 280, mass: 0.85 };

function glassChrome() {
  return Platform.OS === "web"
    ? ({
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
      } as object)
    : { elevation: 10 };
}

export function MiniPlayerTrack({ track }: { track: Track }) {
  const { playing, buffering, togglePlay, skipQueue, pause } = usePlayer();
  const { openNowPlaying, dismissMiniPlayer } = usePlayerUi();
  const { isFavorite, toggleFavorite } = useFavorites();
  const liked = isFavorite(track.id);
  const cover = useCoverUrl(track.coverId);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const startPage = useRef({ x: 0, y: 0 });

  const openSheet = useCallback(() => {
    triggerUiHaptic();
    openNowPlaying();
  }, [openNowPlaying]);

  const hideAndStop = useCallback(() => {
    triggerUiHaptic();
    pause();
    dismissMiniPlayer();
  }, [dismissMiniPlayer, pause]);

  const skip = useCallback(
    (direction: 1 | -1) => {
      triggerUiHaptic();
      void skipQueue(direction);
    },
    [skipQueue],
  );

  const clearLongPress = useCallback(() => {
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  }, []);

  const settlePan = useCallback(
    (dx: number, dy: number, vx: number, vy: number) => {
      if (longFired.current) return;
      if (Math.hypot(dx, dy) < TAP_SLOP) {
        openSheet();
        return;
      }
      const pullDown = (dy > SWIPE_DOWN && dy >= Math.abs(dx)) || (vy > SWIPE_DOWN_VELOCITY && dy > TAP_SLOP);
      if (pullDown) {
        hideAndStop();
        return;
      }
      const goNext = dx < -SWIPE_DISTANCE || (vx < -SWIPE_VELOCITY && dx < -TAP_SLOP);
      const goPrev = dx > SWIPE_DISTANCE || (vx > SWIPE_VELOCITY && dx > TAP_SLOP);
      if (goNext) skip(1);
      else if (goPrev) skip(-1);
    },
    [hideAndStop, openSheet, skip],
  );

  const followPan = useCallback(
    (dx: number, dy: number) => {
      if (dy > 0 && dy >= Math.abs(dx)) {
        translateY.value = dy;
        translateX.value = 0;
        return;
      }
      translateX.value = dx * 0.82;
      translateY.value = 0;
    },
    [translateX, translateY],
  );

  const resetPan = useCallback(() => {
    translateX.value = withSpring(0, PAN_SPRING);
    translateY.value = withSpring(0, PAN_SPRING);
  }, [translateX, translateY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          startPage.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          };
          longFired.current = false;
          clearLongPress();
          longTimer.current = setTimeout(() => {
            longFired.current = true;
            longTimer.current = null;
            hideAndStop();
          }, LONG_PRESS_MS);
        },
        onPanResponderMove: (event) => {
          const dx = event.nativeEvent.pageX - startPage.current.x;
          const dy = event.nativeEvent.pageY - startPage.current.y;
          if (Math.hypot(dx, dy) < 12) return;
          clearLongPress();
          followPan(dx, dy);
        },
        onPanResponderRelease: (event, gestureState) => {
          clearLongPress();
          const dx = event.nativeEvent.pageX - startPage.current.x;
          const dy = event.nativeEvent.pageY - startPage.current.y;
          settlePan(dx, dy, gestureState.vx * 1000, gestureState.vy * 1000);
          resetPan();
        },
        onPanResponderTerminate: () => {
          clearLongPress();
          resetPan();
        },
      }),
    [clearLongPress, followPan, hideAndStop, resetPan, settlePan],
  );

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  const shiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <Reanimated.View
      collapsable={false}
      style={[
        styles.bar,
        glassChrome(),
        shiftStyle,
        Platform.OS === "web" ? ({ userSelect: "none", WebkitUserSelect: "none" } as object) : null,
      ]}
    >
      <View
        accessibilityRole="button"
        accessibilityLabel={`${track.title}. ${track.artistName}`}
        {...pan.panHandlers}
        style={styles.press}
      >
        <Cover id={track.id} label={track.title} uri={cover} size={40} radius={8} />
        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.title}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {buffering ? "Cargando…" : track.artistName}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={liked ? "Quitar de favoritos" : "Añadir a favoritos"}
        hitSlop={8}
        onPress={() => {
          triggerUiHaptic();
          void toggleFavorite(track);
        }}
        style={styles.heart}
      >
        <Heart color={liked ? colors.accent : colors.muted} fill={liked ? colors.accent : "transparent"} size={18} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pausar" : "Reproducir"}
        hitSlop={12}
        delayLongPress={LONG_PRESS_MS}
        onLongPress={hideAndStop}
        onPress={() => {
          void togglePlay();
        }}
        style={styles.play}
      >
        {playing ? (
          <Pause color={colors.ink} size={20} fill={colors.ink} />
        ) : (
          <Play color={colors.ink} size={20} fill={colors.ink} />
        )}
      </Pressable>
    </Reanimated.View>
  );
}

export function MiniPlayer() {
  const insets = useSafeAreaInsets();
  const { current, playNonce } = usePlayer();
  const { nowPlayingOpen, miniPlayerDismissed, revealMiniPlayer } = usePlayerUi();
  const dock = useDock();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    revealMiniPlayer();
  }, [playNonce, revealMiniPlayer]);

  useEffect(() => {
    if (!current) revealMiniPlayer();
  }, [current, revealMiniPlayer]);

  const visible =
    Boolean(current) && (dock?.visible ?? true) && !nowPlayingOpen && !miniPlayerDismissed;
  const interactive = Boolean(current) && !miniPlayerDismissed && !nowPlayingOpen;
  const hiddenOffset = layout.miniPlayerHeight + DOCK_HEIGHT + insets.bottom + 48;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: visible ? 0 : 1,
      damping: 22,
      stiffness: 280,
      mass: 0.85,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [progress, visible]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, hiddenOffset],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [1, 0, 0],
  });

  if (!current) return null;

  return (
    <Animated.View
      pointerEvents={interactive ? "box-none" : "none"}
      style={[
        styles.host,
        {
          bottom: DOCK_HEIGHT + DOCK_MARGIN + insets.bottom + layout.miniPlayerGap,
          opacity,
          transform: [{ translateY }],
        },
        Platform.OS === "web" ? ({ position: "fixed" } as object) : null,
      ]}
    >
      <MiniPlayerTrack track={current} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 35,
  },
  bar: {
    minHeight: layout.miniPlayerHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    backgroundColor: GLASS_FILL,
    borderColor: colors.rule,
    borderWidth: 1,
    borderRadius: 22,
  },
  press: {
    flex: 1,
    minHeight: layout.miniPlayerHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.ink,
  },
  artist: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  heart: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
