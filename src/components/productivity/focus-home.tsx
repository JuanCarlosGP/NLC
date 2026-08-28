import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LadybugMark } from "@/components/brand/ladybug-mark";
import { ZoneSwitch } from "@/components/layout/zone-switch";
import { ShortcutCard } from "@/components/home/shortcut-card";
import { TaskRow, taskListStyle } from "@/components/productivity/task-row";
import { Screen } from "@/components/ui/screen";
import { useI18n } from "@/lib/i18n/context";
import { taskHref } from "@/lib/library/href";
import { useActiveProjects, useVisibleTasks } from "@/lib/productivity/productivity-context";
import { useTaskActions } from "@/lib/productivity/task-actions-context";
import { INBOX_PROJECT_ID } from "@/lib/productivity/types";
import { type } from "@/lib/theme";

export function FocusHome() {
  const { t } = useI18n();
  const router = useRouter();
  const projects = useActiveProjects();
  const tasks = useVisibleTasks();
  const { openTaskActions } = useTaskActions();

  const doing = useMemo(() => tasks.filter((task) => task.status === "doing"), [tasks]);
  const upcoming = useMemo(
    () =>
      tasks
        .filter((task) => {
          if (task.status === "done" || task.status === "doing") return false;
          return task.projectId === INBOX_PROJECT_ID || task.dueAt != null;
        })
        .sort((a, b) => {
          if (a.dueAt != null && b.dueAt != null) return a.dueAt - b.dueAt;
          if (a.dueAt != null) return -1;
          if (b.dueAt != null) return 1;
          return a.sort - b.sort;
        }),
    [tasks],
  );

  function projectOf(projectId: string) {
    return projects.find((project) => project.id === projectId);
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <LadybugMark />
        <ZoneSwitch />
      </View>

      <View style={styles.shortcuts}>
        <ShortcutCard
          id="focus-today"
          title={t("focus.today")}
          focus="today"
          onPress={() => router.push("/focus/today")}
        />
        <ShortcutCard
          id="focus-inbox"
          title={t("focus.inbox")}
          focus="inbox"
          onPress={() => router.push("/focus/inbox")}
        />
        <ShortcutCard
          id="focus-projects"
          title={t("projects.title")}
          focus="projects"
          onPress={() => router.push("/projects")}
        />
        <ShortcutCard
          id="focus-reminders"
          title={t("focus.reminders")}
          focus="reminders"
          onPress={() => router.push("/focus/reminders")}
        />
      </View>

      {doing.length ? (
        <View style={styles.section}>
          <Text style={type.sectionTitle}>{t("focus.inProgress")}</Text>
          <View style={taskListStyle}>
            {doing.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                project={projectOf(task.projectId)}
                onPress={() => router.push(taskHref(task.id))}
                onLongPress={() => openTaskActions(task)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {upcoming.length ? (
        <View style={styles.section}>
          <Text style={type.sectionTitle}>{t("focus.upcoming")}</Text>
          <View style={taskListStyle}>
            {upcoming.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                project={projectOf(task.projectId)}
                onPress={() => router.push(taskHref(task.id))}
                onLongPress={() => openTaskActions(task)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {!doing.length && !upcoming.length ? (
        <Text style={type.body}>{t("focus.emptyHomeHint")}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: { flex: 1 },
  shortcuts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  section: { gap: 8 },
});
