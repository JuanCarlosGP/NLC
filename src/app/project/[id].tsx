import { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FocusListScreen } from "@/components/productivity/focus-list-screen";
import { TaskComposerSheet } from "@/components/productivity/task-composer-sheet";
import { libraryParamId } from "@/lib/library/href";
import { useActiveProjects, useVisibleTasks } from "@/lib/productivity/productivity-context";
import { colors } from "@/lib/theme";

export default function ProjectScreen() {
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
    ? `${list.length} ${list.length === 1 ? "tarea" : "tareas"}`
    : "Sin tareas abiertas";

  if (!project) {
    return (
      <FocusListScreen
        title="Proyecto"
        label="Productividad"
        countLabel="No encontrado"
        empty="Este proyecto no existe o está archivado."
        tint={colors.sheetRaised}
        art={null}
        tasks={[]}
      />
    );
  }

  return (
    <>
      <FocusListScreen
        title={project.name}
        label="Proyecto"
        countLabel={count}
        empty="Aún no hay tareas abiertas en este proyecto."
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
