import { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FocusListScreen } from "@/components/productivity/focus-list-screen";
import { TaskComposerSheet } from "@/components/productivity/task-composer-sheet";
import { useI18n } from "@/lib/i18n/context";
import { libraryParamId } from "@/lib/library/href";
import { useActiveProjects, useVisibleTasks } from "@/lib/productivity/productivity-context";
import { projectDisplayName } from "@/lib/productivity/types";
import { colors } from "@/lib/theme";

export default function ProjectScreen() {
  const { t } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = libraryParamId(rawId);
  const projects = useActiveProjects();
  const tasks = useVisibleTasks();
  const [composeOpen, setComposeOpen] = useState(false);
  const project = id ? projects.find((item) => item.id === id) : undefined;
  const list = useMemo(
    () => (id ? tasks.filter((task) => task.projectId === id && task.status !== "done") : []),
    [id, tasks],
  );
  const count = list.length
    ? t(list.length === 1 ? "projects.taskOne" : "projects.taskMany", { count: list.length })
    : t("projects.noOpenTasks");

  if (!project) {
    return (
      <FocusListScreen
        title={t("projects.one")}
        label={t("focus.productivity")}
        countLabel={t("projects.notFound")}
        empty={t("projects.notFoundBody")}
        tint={colors.sheetRaised}
        art={null}
        tasks={[]}
      />
    );
  }

  return (
    <>
      <FocusListScreen
        title={projectDisplayName(project)}
        label={t("projects.one")}
        countLabel={count}
        empty={t("projects.emptyOpenTasks")}
        tint={project.color}
        art={<View style={[styles.dot, { backgroundColor: colors.accent }]} />}
        tasks={list}
        onAdd={() => setComposeOpen(true)}
      />
      <TaskComposerSheet
        open={composeOpen}
        onOpenChange={setComposeOpen}
        defaultProjectId={project.id}
      />
    </>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 22,
    height: 22,
    borderRadius: 999,
  },
});
