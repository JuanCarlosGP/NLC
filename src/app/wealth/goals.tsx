import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { GoalComposerSheet } from "@/components/wealth/goal-composer-sheet";
import { GoalRow, goalListStyle } from "@/components/wealth/goal-row";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, type } from "@/lib/theme";
import { useWealth } from "@/lib/wealth/wealth-context";
import type { WealthGoal } from "@/lib/wealth/types";

export default function WealthGoalsScreen() {
  const { t } = useI18n();
  const { goalProgress } = useWealth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WealthGoal | null>(null);

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <Text style={[type.pageTitle, styles.title]}>{t("wealth.goals")}</Text>
          <Pressable
            accessibilityLabel={t("wealth.newGoal")}
            onPress={() => {
              triggerUiHaptic();
              setEditing(null);
              setOpen(true);
            }}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Plus size={24} color={colors.ink} strokeWidth={1.8} />
          </Pressable>
        </View>
        {goalProgress.length ? (
          <View style={goalListStyle}>
            {goalProgress.map((item) => (
              <GoalRow
                key={item.goal.id}
                progress={item}
                onPress={() => {
                  triggerUiHaptic();
                  setEditing(item.goal);
                  setOpen(true);
                }}
              />
            ))}
          </View>
        ) : (
          <Text style={type.body}>{t("wealth.goalsHintLong")}</Text>
        )}
      </Screen>
      <GoalComposerSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
        goal={editing}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  title: { flex: 1 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
