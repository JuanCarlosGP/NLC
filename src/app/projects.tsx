import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FolderKanban, Plus } from "lucide-react-native";
import { ProjectComposerSheet } from "@/components/productivity/project-composer-sheet";
import { SeriesRow, seriesListStyle } from "@/components/video/series-row";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import { projectHref } from "@/lib/library/href";
import { useActiveProjects, useProductivity, useVisibleTasks } from "@/lib/productivity/productivity-context";
import { INBOX_PROJECT_ID } from "@/lib/productivity/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, type } from "@/lib/theme";

export default function ProjectsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const projects = useActiveProjects();
  const { projects: allProjects, archiveProject } = useProductivity();
  const tasks = useVisibleTasks();
  const archived = allProjects.filter((project) => project.archived);
  const [composeOpen, setComposeOpen] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const target = projects.find((project) => project.id === archiveId);

  function countFor(projectId: string) {
    const n = tasks.filter((task) => task.projectId === projectId && task.status !== "done").length;
    return n ? t(n === 1 ? "projects.taskOne" : "projects.taskMany", { count: n }) : t("projects.noOpenTasks");
  }

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <View style={styles.art}>
            <FolderKanban color={colors.accent} size={36} strokeWidth={1.8} />
          </View>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <Text style={type.label}>{t("focus.productivity")}</Text>
              <Text style={type.pageTitle}>{t("projects.title")}</Text>
              <Text style={type.meta}>
                {projects.length
                  ? t(projects.length === 1 ? "projects.projectOne" : "projects.projectMany", {
                      count: projects.length,
                    })
                  : t("projects.none")}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t("projects.newProject")}
              onPress={() => {
                triggerUiHaptic();
                setComposeOpen(true);
              }}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Plus size={24} color={colors.ink} strokeWidth={1.8} />
            </Pressable>
          </View>
        </View>
        <View style={seriesListStyle}>
          {projects.map((project) => (
            <SeriesRow
              key={project.id}
              title={project.name}
              subtitle={countFor(project.id)}
              onPress={() => router.push(projectHref(project.id))}
              onLongPress={
                project.id === INBOX_PROJECT_ID
                  ? undefined
                  : () => {
                      triggerUiHaptic();
                      setArchiveId(project.id);
                    }
              }
            />
          ))}
        </View>
        {archived.length ? (
          <View>
            <Text style={type.sectionTitle}>{t("projects.archived")}</Text>
            <View style={seriesListStyle}>
              {archived.map((project) => (
                <SeriesRow
                  key={project.id}
                  title={project.name}
                  subtitle={t("projects.restoreHint")}
                  onPress={() => void archiveProject(project.id, false)}
                  onLongPress={() => void archiveProject(project.id, false)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </Screen>
      <ProjectComposerSheet open={composeOpen} onOpenChange={setComposeOpen} />
      <ConfirmDialog
        open={Boolean(target)}
        title={t("projects.archive")}
        message={target ? t("projects.archiveConfirm", { name: target.name }) : ""}
        confirmLabel={t("projects.archive")}
        cancelLabel={t("common.cancel")}
        destructive={false}
        onCancel={() => setArchiveId(null)}
        onConfirm={() => {
          if (!archiveId) return;
          void archiveProject(archiveId).then(() => setArchiveId(null));
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingTop: 8 },
  art: {
    width: 96,
    height: 96,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2E3140",
    marginBottom: 8,
  },
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
});
