import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Circle, CircleDot, Star, Trash2 } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import { useProductivity } from "@/lib/productivity/productivity-context";
import { useTaskActions } from "@/lib/productivity/task-actions-context";
import { projectDisplayName, STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "@/lib/productivity/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

const STATUS_ICON: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  doing: CircleDot,
  done: Check,
};

export function TaskActionsSheet() {
  const { t } = useI18n();
  const { open, task, setOpen } = useTaskActions();
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      accessibilityCloseLabel={t("focus.closeTaskActions")}
      viewportRatio={0.52}
    >
      {task ? <TaskActionsBody taskId={task.id} onClose={() => setOpen(false)} /> : null}
    </BottomSheet>
  );
}

function TaskActionsBody({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { t } = useI18n();
  const { tasks, projects, updateTask, deleteTask } = useProductivity();
  const task = tasks.find((item) => item.id === taskId);
  const project = task ? projects.find((item) => item.id === task.projectId) : null;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!task) return null;

  function closeAfter(action: () => Promise<void>) {
    triggerUiHaptic();
    void action().then(onClose);
  }

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.dot, { backgroundColor: project?.color ?? colors.ruleLight }]} />
          <View style={styles.headerMeta}>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {task.title}
            </Text>
            <Text style={styles.headerSub}>{project ? projectDisplayName(project) : t("focus.task")}</Text>
          </View>
        </View>
        <View style={styles.rule} />
        {TASK_STATUSES.map((status) => {
          const Icon = STATUS_ICON[status];
          const active = task.status === status;
          return (
            <ActionRow
              key={status}
              icon={<Icon color={active ? colors.accent : colors.ink} size={20} strokeWidth={1.8} />}
              label={STATUS_LABEL[status]}
              onPress={() => {
                if (active) return;
                closeAfter(() => updateTask(task.id, { status }));
              }}
            />
          );
        })}
        <ActionRow
          icon={
            <Star
              color={colors.accent}
              fill={task.starred ? colors.accent : "transparent"}
              size={20}
              strokeWidth={1.8}
            />
          }
          label={task.starred ? t("focus.unstar") : t("focus.star")}
          onPress={() => closeAfter(() => updateTask(task.id, { starred: !task.starred }))}
        />
        <ActionRow
          icon={<Trash2 color={colors.danger} size={20} strokeWidth={1.8} />}
          label={t("common.delete")}
          danger
          onPress={() => {
            triggerUiHaptic();
            setConfirm(true);
          }}
        />
      </SheetScrollView>
      <ConfirmDialog
        open={confirm}
        title={t("focus.deleteTask")}
        message={t("focus.deleteTaskConfirm", { title: task.title })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirm(false);
        }}
        onConfirm={() => {
          setBusy(true);
          void deleteTask(task.id)
            .then(onClose)
            .finally(() => {
              setBusy(false);
              setConfirm(false);
            });
        }}
      />
    </>
  );
}

function ActionRow({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.72 : 1 }]}
    >
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  headerMeta: { flex: 1, gap: 3 },
  headerTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.ink,
  },
  headerSub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
    marginBottom: 8,
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  icon: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  labelDanger: { color: colors.danger },
});
