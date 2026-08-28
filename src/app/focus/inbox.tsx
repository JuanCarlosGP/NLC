import { useMemo, useState } from "react";
import { Inbox } from "lucide-react-native";
import { FocusListScreen } from "@/components/productivity/focus-list-screen";
import { TaskComposerSheet } from "@/components/productivity/task-composer-sheet";
import { useI18n } from "@/lib/i18n/context";
import { useVisibleTasks } from "@/lib/productivity/productivity-context";
import { INBOX_PROJECT_ID } from "@/lib/productivity/types";
import { colors } from "@/lib/theme";

export default function InboxScreen() {
  const { t } = useI18n();
  const tasks = useVisibleTasks();
  const [composeOpen, setComposeOpen] = useState(false);
  const inbox = useMemo(
    () => tasks.filter((task) => task.projectId === INBOX_PROJECT_ID && task.status !== "done"),
    [tasks],
  );
  const count = inbox.length
    ? t(inbox.length === 1 ? "projects.taskOne" : "projects.taskMany", { count: inbox.length })
    : t("focus.inboxEmpty");

  return (
    <>
      <FocusListScreen
        title={t("focus.inbox")}
        label={t("focus.productivity")}
        countLabel={count}
        empty={t("focus.emptyInboxHint")}
        tint="#2C3330"
        art={<Inbox color={colors.accent} size={36} strokeWidth={1.8} />}
        tasks={inbox}
        onAdd={() => setComposeOpen(true)}
      />
      <TaskComposerSheet
        open={composeOpen}
        onOpenChange={setComposeOpen}
        defaultProjectId={INBOX_PROJECT_ID}
      />
    </>
  );
}
