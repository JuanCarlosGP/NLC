import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";
import { useI18n } from "@/lib/i18n/context";
import { formatGoalEta, type GoalProgress } from "@/lib/wealth/compute";
import { formatEuro } from "@/lib/wealth/money";

export function GoalRow({
  progress,
  onPress,
}: {
  progress: GoalProgress;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const pctLabel = `${Math.round(progress.pct * 100)} %`;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.72 : 1 }]}>
      <View style={styles.top}>
        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.name}>
            {progress.goal.name}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {progress.scopeLabel} · {t("wealth.amountOf", {
              current: formatEuro(progress.current),
              target: formatEuro(progress.goal.target),
            })}
          </Text>
        </View>
        <Text style={[styles.pct, progress.reached && styles.pctDone]}>{pctLabel}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, progress.reached ? styles.barDone : null, { width: `${Math.round(progress.pct * 100)}%` }]} />
      </View>
      <Text style={styles.eta}>{formatGoalEta(progress)}</Text>
    </Pressable>
  );
}

export const goalListStyle = { gap: 4 } as const;

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingVertical: 12,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  meta: { flex: 1, gap: 2 },
  name: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  pct: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.inkSoft,
  },
  pctDone: { color: colors.ok },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.void,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  barDone: { backgroundColor: colors.ok },
  eta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
});
