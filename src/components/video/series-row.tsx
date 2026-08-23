import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Play } from "lucide-react-native";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, layout } from "@/lib/theme";

const RIPPLE = { color: "rgba(240, 235, 227, 0.12)" };

export function SeriesRow({
  index,
  title,
  subtitle,
  playable,
  onPress,
  onLongPress,
}: {
  index?: number;
  title: string;
  subtitle?: string | null;
  playable?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={RIPPLE}
      delayLongPress={350}
      onPress={() => {
        triggerSelectionUiHaptic();
        onPress();
      }}
      onLongPress={
        onLongPress
          ? () => {
              triggerSelectionUiHaptic();
              onLongPress();
            }
          : undefined
      }
      style={({ pressed }) => [
        styles.row,
        Platform.OS !== "android" && pressed ? styles.pressed : null,
      ]}
    >
      {index != null ? (
        <View style={styles.badge}>
          <Text style={styles.index}>{index}</Text>
        </View>
      ) : null}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {playable ? (
        <Play color={colors.inkSoft} size={16} strokeWidth={2} />
      ) : (
        <ChevronRight color={colors.muted} size={20} strokeWidth={1.8} />
      )}
    </Pressable>
  );
}

export const seriesListStyle = {
  marginHorizontal: -layout.screenPad,
};

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: layout.screenPad,
    overflow: "hidden",
  },
  pressed: { opacity: 0.8 },
  badge: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.sheetRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  index: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 18,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  meta: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});
