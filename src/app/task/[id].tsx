import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Star } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import { dueToday, dueTomorrow, formatDue, isOverdue } from "@/lib/productivity/dates";
import { libraryParamId } from "@/lib/library/href";
import { useActiveProjects, useProductivity } from "@/lib/productivity/productivity-context";
import { projectDisplayName, STATUS_LABEL, TASK_STATUSES } from "@/lib/productivity/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

export default function TaskScreen() {
  const { t } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = libraryParamId(rawId);
  const router = useRouter();
  const { tasks, updateTask, deleteTask, ready } = useProductivity();
  const projects = useActiveProjects();
  const task = id ? tasks.find((item) => item.id === id) : undefined;
  const project = task ? projects.find((item) => item.id === task.projectId) : undefined;
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes);
  }, [task?.id, task?.title, task?.notes]);

  if (!ready) {
    return (
      <Screen>
        <Text style={type.meta}>{t("common.loading")}</Text>
      </Screen>
    );
  }

  if (!task) {
    return (
      <Screen>
        <Text style={type.pageTitle}>{t("focus.task")}</Text>
        <Text style={type.body}>{t("focus.missingTask")}</Text>
      </Screen>
    );
  }

  const current = task;
  const overdue = isOverdue(current.dueAt, current.status);
  const todayLabel = t("dates.today");
  const tomorrowLabel = t("dates.tomorrow");

  async function saveTitle() {
    const next = title.trim();
    if (!next || next === current.title) return;
    await updateTask(current.id, { title: next });
  }

  async function saveNotes() {
    if (notes === current.notes) return;
    await updateTask(current.id, { notes });
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={[styles.art, { backgroundColor: project?.color ?? colors.sheetRaised }]}>
          <View style={[styles.innerDot, { backgroundColor: colors.accent }]} />
        </View>
        <Text style={type.label}>{project ? projectDisplayName(project) : t("focus.task")}</Text>
        <View style={styles.titleRow}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={() => void saveTitle()}
            style={styles.titleInput}
            placeholder={t("focus.title")}
            placeholderTextColor={colors.muted}
          />
          <Pressable
            accessibilityLabel={current.starred ? t("focus.unstar") : t("focus.star")}
            onPress={() => {
              triggerUiHaptic();
              void updateTask(current.id, { starred: !current.starred });
            }}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Star
              color={colors.accent}
              fill={current.starred ? colors.accent : "transparent"}
              size={22}
              strokeWidth={1.8}
            />
          </Pressable>
        </View>
      </View>

      <Text style={type.label}>{t("focus.statusLabel")}</Text>
      <View style={styles.chips}>
        {TASK_STATUSES.map((status) => {
          const active = current.status === status;
          return (
            <Pressable
              key={status}
              onPress={() => {
                if (active) return;
                triggerUiHaptic();
                void updateTask(current.id, { status });
              }}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>
                {STATUS_LABEL[status]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={type.label}>{t("focus.date")}</Text>
      <View style={styles.chips}>
        {(
          [
            [null, t("dates.noDate")],
            [dueToday(), todayLabel],
            [dueTomorrow(), tomorrowLabel],
          ] as const
        ).map(([value, label]) => {
          const active =
            value == null
              ? current.dueAt == null
              : current.dueAt != null && formatDue(current.dueAt) === label;
          return (
            <Pressable
              key={label}
              onPress={() => {
                triggerUiHaptic();
                void updateTask(current.id, { dueAt: value });
              }}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelOn, overdue && active && styles.chipOverdue]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {current.dueAt != null && formatDue(current.dueAt) !== todayLabel && formatDue(current.dueAt) !== tomorrowLabel ? (
        <Text style={[type.meta, overdue && styles.overdue]}>{formatDue(current.dueAt)}</Text>
      ) : null}

      <Text style={type.label}>{t("focus.project")}</Text>
      <View style={styles.chips}>
        {projects.map((item) => {
          const active = item.id === current.projectId;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                if (active) return;
                triggerUiHaptic();
                void updateTask(current.id, { projectId: item.id });
              }}
              style={[styles.chip, active && styles.chipOn]}
            >
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{projectDisplayName(item)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={type.label}>{t("focus.notes")}</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        onBlur={() => void saveNotes()}
        placeholder={t("focus.notesHint")}
        placeholderTextColor={colors.muted}
        multiline
        style={styles.notes}
      />

      <Pressable
        onPress={() => {
          triggerUiHaptic();
          setConfirm(true);
        }}
        style={({ pressed }) => [styles.delete, { opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={styles.deleteText}>{t("common.delete")}</Text>
      </Pressable>

      <ConfirmDialog
        open={confirm}
        title={t("focus.deleteTask")}
        message={t("focus.deleteTaskConfirm", { title: current.title })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirm(false);
        }}
        onConfirm={() => {
          setBusy(true);
          void deleteTask(current.id)
            .then(() => {
              setConfirm(false);
              if (router.canGoBack()) router.back();
              else router.replace("/");
            })
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
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
    marginBottom: 8,
  },
  innerDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  titleInput: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.4,
    color: colors.ink,
    padding: 0,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.sheet,
  },
  chipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  chipLabelOn: { color: colors.void },
  chipOverdue: { color: colors.danger },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  notes: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 120,
    textAlignVertical: "top",
  },
  delete: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  deleteText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.danger,
  },
  overdue: { color: colors.danger },
});
