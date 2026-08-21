import { Pressable, StyleSheet, Text, View } from "react-native";
import { Heart } from "lucide-react-native";
import { useFavorites } from "@/lib/favorites/favorites-context";
import type { Track } from "@/lib/nas/types";
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
  onPress,
}: {
  track: Track;
  index?: number;
  active?: boolean;
  onPress: () => void;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const liked = isFavorite(track.id);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}>
      <Text style={[styles.num, active && styles.active]}>{index ?? track.track ?? "·"}</Text>
      <View style={styles.meta}>
        <Text numberOfLines={1} style={[styles.title, active && styles.active]}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.sub}>
          {track.artistName}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={liked ? "Quitar de favoritos" : "Añadir a favoritos"}
        hitSlop={10}
        onPress={() => {
          triggerUiHaptic();
          void toggleFavorite(track);
        }}
        style={styles.heart}
      >
        <Heart color={liked ? colors.accent : colors.muted} fill={liked ? colors.accent : "transparent"} size={16} />
      </Pressable>
      <Text style={styles.time}>{formatDuration(track.durationMs)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  num: {
    width: 24,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  meta: { flex: 1, gap: 2 },
  heart: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  time: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  active: { color: colors.accent },
});
