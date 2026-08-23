import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { MoreVertical } from "lucide-react-native";
import { Cover } from "@/components/ui/cover";
import { LIST_EXIT_MS } from "@/hooks/use-exiting-list";
import { useTrackArtwork } from "@/hooks/use-cover-url";
import { withTrackArtwork } from "@/lib/library/artwork-cache";
import type { Track } from "@/lib/nas/types";
import { useTrackActions } from "@/lib/player/track-actions-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

function formatDuration(ms: number): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function TrackRow({
  track,
  index,
  active,
  exiting,
  playlistId,
  onPress,
}: {
  track: Track;
  index?: number;
  active?: boolean;
  exiting?: boolean;
  playlistId?: string;
  onPress: () => void;
}) {
  const { openTrackActions } = useTrackActions();
  const cover = useTrackArtwork(track);
  const display = withTrackArtwork(track);
  const time = formatDuration(display.durationMs);
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = exiting
      ? withTiming(0, { duration: LIST_EXIT_MS, easing: Easing.out(Easing.cubic) })
      : 1;
  }, [exiting, progress]);

  const exitStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    maxHeight: 4 + progress.value * 60,
    transform: [{ translateX: (1 - progress.value) * -8 }],
    overflow: "hidden",
  }));

  return (
    <Animated.View style={exitStyle} pointerEvents={exiting ? "none" : "auto"}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}>
        <Cover id={track.id} label={track.title} uri={cover} size={44} radius={4} />
        <View style={styles.meta}>
          <Text numberOfLines={1} style={[styles.title, active && styles.active]}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {[index != null ? `${index}` : null, track.artistName].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={styles.trailing}>
          {time ? <Text style={styles.time}>{time}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Más opciones"
            hitSlop={10}
            onPress={() => {
              triggerUiHaptic();
              openTrackActions(track, { playlistId });
            }}
            style={styles.more}
          >
            <MoreVertical color={colors.ink} size={20} strokeWidth={2} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  meta: { flex: 1, gap: 2 },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  more: {
    width: 22,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  time: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  active: { color: colors.accent },
});
