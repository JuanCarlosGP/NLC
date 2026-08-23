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

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Por hacer",
  doing: "En curso",
  done: "Hecho",
};
