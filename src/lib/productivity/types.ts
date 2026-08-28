import { t } from "@/lib/i18n/runtime";

export type TaskStatus = "todo" | "doing" | "done";

export type ProdProject = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  archived: boolean;
};

export type ProdTask = {
  id: string;
  projectId: string;
  title: string;
  notes: string;
  status: TaskStatus;
  sort: number;
  dueAt: number | null;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
};

export const INBOX_PROJECT_ID = "inbox";
export const INBOX_PROJECT_NAME = "Bandeja";

export const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "done"];

export function statusLabel(status: TaskStatus): string {
  return t(`focus.status.${status}`);
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  get todo() {
    return statusLabel("todo");
  },
  get doing() {
    return statusLabel("doing");
  },
  get done() {
    return statusLabel("done");
  },
};

export function projectDisplayName(project: { id: string; name: string }): string {
  return project.id === INBOX_PROJECT_ID ? t("focus.inbox") : project.name;
}
