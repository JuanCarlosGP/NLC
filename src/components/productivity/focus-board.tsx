import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { TaskComposerSheet } from "@/components/productivity/task-composer-sheet";
import { TaskRow } from "@/components/productivity/task-row";
import { Screen } from "@/components/ui/screen";
import { taskHref } from "@/lib/library/href";
import { useActiveProjects, useVisibleTasks } from "@/lib/productivity/productivity-context";
import { useTaskActions } from "@/lib/productivity/task-actions-context";
import { STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "@/lib/productivity/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, layout, type } from "@/lib/theme";

export function FocusBoard() {
  const router = useRouter();
  const projects = useActiveProjects();
  const tasks = useVisibleTasks();
  const { openTaskActions } = useTaskActions();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const columnWidth = Math.min(300, Math.max(240, width * 0.72));

  const visible = useMemo(
    () => (filter ? tasks.filter((task) => task.projectId === filter) : tasks),
    [filter, tasks],
  );

  const byStatus = useMemo(() => {
    const groups: Record<TaskStatus, typeof visible> = { todo: [], doing: [], done: [] };
    for (const task of visible) groups[task.status].push(task);
    return groups;
  }, [visible]);

  return (
    <>
      <Screen scroll={false}>
        <View style={styles.header}>
          <Text style={[type.pageTitle, styles.title]}>Biblioteca</Text>
          <Pressable
            accessibilityLabel="Nueva tarea"
            onPress={() => {
              triggerUiHaptic();
              setComposeOpen(true);
            }}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Plus size={24} color={colors.ink} strokeWidth={1.8} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabs}
        >
          <Pressable
            onPress={() => setFilter(null)}
            style={[styles.tab, filter == null && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, filter == null && styles.tabLabelActive]}>Todos</Text>
          </Pressable>
          {projects.map((project) => {
            const active = filter === project.id;
            return (
              <Pressable
                key={project.id}
                onPress={() => setFilter(project.id)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <View style={[styles.dot, { backgroundColor: project.color }]} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{project.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.board}
          contentContainerStyle={styles.boardContent}
        >
          {TASK_STATUSES.map((status) => (
            <View key={status} style={[styles.column, { width: columnWidth }]}>
              <View style={styles.columnHead}>
                <Text style={type.label}>{STATUS_LABEL[status]}</Text>
                <Text style={styles.count}>{byStatus[status].length}</Text>
              </View>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.cards}
              >
                {byStatus[status].map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    compact
                    project={projects.find((project) => project.id === task.projectId)}
                    onPress={() => router.push(taskHref(task.id))}
                    onLongPress={() => openTaskActions(task)}
                  />
                ))}
                {!byStatus[status].length ? (
                  <Text style={styles.empty}>Nada aquí.</Text>
                ) : null}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      </Screen>
      <TaskComposerSheet
        open={composeOpen}
        onOpenChange={setComposeOpen}
        defaultProjectId={filter}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
  },
  title: { flex: 1 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  tabsScroll: {
    marginHorizontal: -layout.screenPad,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: layout.screenPad,
    paddingRight: layout.screenPad + 28,
    paddingBottom: 8,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.sheet,
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  tabLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.inkSoft },
  tabLabelActive: { color: colors.void },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  board: {
    flex: 1,
    marginHorizontal: -layout.screenPad,
  },
  boardContent: {
    paddingHorizontal: layout.screenPad,
    gap: 10,
    paddingBottom: 8,
  },
  column: {
    backgroundColor: colors.sheet,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: 10,
    maxHeight: "100%",
  },
  columnHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  count: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.muted,
  },
  cards: {
    gap: 8,
    paddingBottom: 12,
  },
  empty: {
    ...type.meta,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
});
