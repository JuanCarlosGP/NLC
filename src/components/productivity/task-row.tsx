import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Star } from "lucide-react-native";
import { formatDue, isOverdue } from "@/lib/productivity/dates";
import type { ProdProject, ProdTask } from "@/lib/productivity/types";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, layout } from "@/lib/theme";

const RIPPLE = { color: "rgba(240, 235, 227, 0.12)" };

export function TaskRow({
  task,
  project,
  compact,
  onPress,
  onLongPress,
}: {
  task: ProdTask;
  project?: ProdProject | null;
  compact?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const overdue = isOverdue(task.dueAt, task.status);
  const due = task.dueAt != null ? formatDue(task.dueAt) : null;
  const subtitle = [project?.name, due].filter(Boolean).join(" · ");

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
        compact ? styles.card : styles.row,
        Platform.OS !== "android" && pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: project?.color ?? colors.ruleLight }]} />
      <View style={styles.meta}>
        <Text style={[styles.title, task.status === "done" && styles.titleDone]} numberOfLines={2}>
          {task.title}
        </Text>
        {subtitle ? (
          <Text style={[styles.sub, overdue && styles.subOverdue]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {task.starred ? <Star color={colors.accent} fill={colors.accent} size={14} /> : null}
    </Pressable>
  );
}

export const taskListStyle = {
  marginHorizontal: -layout.screenPad,
};

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: layout.screenPad,
    overflow: "hidden",
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.sheetRaised,
  },
  pressed: { opacity: 0.8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 6,
  },
  meta: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  titleDone: { color: colors.muted, textDecorationLine: "line-through" },
  sub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  subOverdue: { color: colors.danger },
});
