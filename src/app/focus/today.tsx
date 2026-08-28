import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react-native";
import { FocusListScreen } from "@/components/productivity/focus-list-screen";
import { TaskComposerSheet } from "@/components/productivity/task-composer-sheet";
import { useI18n } from "@/lib/i18n/context";
import { isDueToday, isOverdue } from "@/lib/productivity/dates";
import { useVisibleTasks } from "@/lib/productivity/productivity-context";
import { INBOX_PROJECT_ID } from "@/lib/productivity/types";
import { colors } from "@/lib/theme";

export default function TodayScreen() {
  const { t } = useI18n();
  const tasks = useVisibleTasks();
  const [composeOpen, setComposeOpen] = useState(false);
  const today = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status !== "done" && (isDueToday(task.dueAt) || isOverdue(task.dueAt, task.status)),
      ),
    [tasks],
  );
  const count = today.length
    ? t(today.length === 1 ? "projects.taskOne" : "projects.taskMany", { count: today.length })
    : t("focus.emptyToday");

  return (
    <>
      <FocusListScreen
        title={t("focus.today")}
        label={t("focus.productivity")}
        countLabel={count}
        empty={t("focus.emptyTodayHint")}
        tint="#353029"
        art={<CalendarDays color={colors.accent} size={36} strokeWidth={1.8} />}
        tasks={today}
        onAdd={() => setComposeOpen(true)}
      />
      <TaskComposerSheet
        open={composeOpen}
        onOpenChange={setComposeOpen}
        defaultProjectId={INBOX_PROJECT_ID}
        defaultDue="today"
      />
    </>
  );
}
