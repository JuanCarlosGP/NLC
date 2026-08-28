import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { TaskRow, taskListStyle } from "@/components/productivity/task-row";
import { Screen } from "@/components/ui/screen";
import { useI18n } from "@/lib/i18n/context";
import { taskHref } from "@/lib/library/href";
import { useActiveProjects } from "@/lib/productivity/productivity-context";
import { useTaskActions } from "@/lib/productivity/task-actions-context";
import type { ProdTask } from "@/lib/productivity/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, type } from "@/lib/theme";

export function FocusListScreen({
  title,
  label,
  countLabel,
  empty,
  art,
  tint,
  tasks,
  onAdd,
}: {
  title: string;
  label: string;
  countLabel: string;
  empty: string;
  art: ReactNode;
  tint: string;
  tasks: ProdTask[];
  onAdd?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const projects = useActiveProjects();
  const { openTaskActions } = useTaskActions();

  return (
    <Screen>
      <View style={styles.header}>
        <View style={[styles.art, { backgroundColor: tint }]}>{art}</View>
        <View style={styles.heading}>
          <View style={styles.headingText}>
            <Text style={type.label}>{label}</Text>
            <Text style={type.pageTitle}>{title}</Text>
            <Text style={type.meta}>{countLabel}</Text>
          </View>
          {onAdd ? (
            <Pressable
              accessibilityLabel={t("focus.newTask")}
              onPress={() => {
                triggerUiHaptic();
                onAdd();
              }}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Plus size={24} color={colors.ink} strokeWidth={1.8} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {tasks.length ? (
        <View style={taskListStyle}>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              project={projects.find((project) => project.id === task.projectId)}
              onPress={() => router.push(taskHref(task.id))}
              onLongPress={() => openTaskActions(task)}
            />
          ))}
        </View>
      ) : (
        <Text style={type.body}>{empty}</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingTop: 8 },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headingText: { flex: 1, gap: 6 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  art: {
    width: 96,
    height: 96,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sheetRaised,
    marginBottom: 8,
  },
});
