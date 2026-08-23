import { getDb } from "@/lib/db/client";
import { coverTint } from "@/lib/theme";
import {
  INBOX_PROJECT_ID,
  INBOX_PROJECT_NAME,
  type ProdProject,
  type ProdTask,
  type TaskStatus,
} from "@/lib/productivity/types";

type ProjectRow = {
  id: string;
  name: string;
  color: string;
  created_at: number;
  archived: number;
};

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  notes: string;
  status: string;
  sort: number;
  due_at: number | null;
  starred: number;
  created_at: number;
  updated_at: number;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapProject(row: ProjectRow): ProdProject {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    archived: Boolean(row.archived),
  };
}

function mapTask(row: TaskRow): ProdTask {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    notes: row.notes,
    status: row.status === "doing" || row.status === "done" ? row.status : "todo",
    sort: row.sort,
    dueAt: row.due_at,
    starred: Boolean(row.starred),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureInbox(): Promise<ProdProject> {
  const db = await getDb();
  const existing = await db.getFirstAsync<ProjectRow>(
    "SELECT id, name, color, created_at, archived FROM prod_projects WHERE id = ?",
    INBOX_PROJECT_ID,
  );
  if (existing) return mapProject(existing);
  const createdAt = Date.now();
  const color = coverTint(INBOX_PROJECT_ID);
  await db.runAsync(
    "INSERT INTO prod_projects (id, name, color, created_at, archived) VALUES (?, ?, ?, ?, 0)",
    INBOX_PROJECT_ID,
    INBOX_PROJECT_NAME,
    color,
    createdAt,
  );
  return {
    id: INBOX_PROJECT_ID,
    name: INBOX_PROJECT_NAME,
    color,
    createdAt,
    archived: false,
  };
}

export async function listProjects(opts?: { includeArchived?: boolean }): Promise<ProdProject[]> {
  await ensureInbox();
  const db = await getDb();
  const rows = opts?.includeArchived
    ? await db.getAllAsync<ProjectRow>(
        "SELECT id, name, color, created_at, archived FROM prod_projects ORDER BY archived ASC, created_at ASC",
      )
    : await db.getAllAsync<ProjectRow>(
        "SELECT id, name, color, created_at, archived FROM prod_projects WHERE archived = 0 ORDER BY created_at ASC",
      );
  return rows.map(mapProject);
}

export async function getProject(id: string): Promise<ProdProject | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProjectRow>(
    "SELECT id, name, color, created_at, archived FROM prod_projects WHERE id = ?",
    id,
  );
  return row ? mapProject(row) : null;
}

export async function createProject(name: string): Promise<ProdProject> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El proyecto necesita un nombre.");
  const db = await getDb();
  const id = newId("proj");
  const createdAt = Date.now();
  const color = coverTint(id);
  await db.runAsync(
    "INSERT INTO prod_projects (id, name, color, created_at, archived) VALUES (?, ?, ?, ?, 0)",
    id,
    trimmed,
    color,
    createdAt,
  );
  return { id, name: trimmed, color, createdAt, archived: false };
}

export async function renameProject(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || id === INBOX_PROJECT_ID) return;
  const db = await getDb();
  await db.runAsync("UPDATE prod_projects SET name = ? WHERE id = ?", trimmed, id);
}

export async function archiveProject(id: string, archived = true): Promise<void> {
  if (id === INBOX_PROJECT_ID) return;
  const db = await getDb();
  await db.runAsync("UPDATE prod_projects SET archived = ? WHERE id = ?", archived ? 1 : 0, id);
}

export async function listTasks(opts?: {
  projectId?: string;
  status?: TaskStatus;
  includeArchived?: boolean;
}): Promise<ProdTask[]> {
  await ensureInbox();
  const db = await getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (opts?.projectId) {
    clauses.push("t.project_id = ?");
    params.push(opts.projectId);
  }
  if (opts?.status) {
    clauses.push("t.status = ?");
    params.push(opts.status);
  }
  if (!opts?.includeArchived) {
    clauses.push("p.archived = 0");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.getAllAsync<TaskRow>(
    `SELECT t.id, t.project_id, t.title, t.notes, t.status, t.sort, t.due_at, t.starred, t.created_at, t.updated_at
     FROM prod_tasks t
     JOIN prod_projects p ON p.id = t.project_id
     ${where}
     ORDER BY t.status ASC, t.sort ASC, t.created_at ASC`,
    ...params,
  );
  return rows.map(mapTask);
}

export async function getTask(id: string): Promise<ProdTask | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TaskRow>(
    `SELECT id, project_id, title, notes, status, sort, due_at, starred, created_at, updated_at
     FROM prod_tasks WHERE id = ?`,
    id,
  );
  return row ? mapTask(row) : null;
}

export async function createTask(input: {
  title: string;
  projectId?: string;
  notes?: string;
  dueAt?: number | null;
  status?: TaskStatus;
}): Promise<ProdTask> {
  const title = input.title.trim();
  if (!title) throw new Error("La tarea necesita un título.");
  await ensureInbox();
  const db = await getDb();
  const projectId = input.projectId || INBOX_PROJECT_ID;
  const status: TaskStatus = input.status ?? "todo";
  const now = Date.now();
  const max = await db.getFirstAsync<{ max_sort: number | null }>(
    "SELECT MAX(sort) AS max_sort FROM prod_tasks WHERE project_id = ? AND status = ?",
    projectId,
    status,
  );
  const sort = (max?.max_sort ?? -1) + 1;
  const id = newId("task");
  const notes = input.notes?.trim() ?? "";
  const dueAt = input.dueAt ?? null;
  await db.runAsync(
    `INSERT INTO prod_tasks (id, project_id, title, notes, status, sort, due_at, starred, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    id,
    projectId,
    title,
    notes,
    status,
    sort,
    dueAt,
    now,
    now,
  );
  return {
    id,
    projectId,
    title,
    notes,
    status,
    sort,
    dueAt,
    starred: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateTask(
  id: string,
  patch: {
    title?: string;
    notes?: string;
    projectId?: string;
    status?: TaskStatus;
    dueAt?: number | null;
    starred?: boolean;
  },
): Promise<void> {
  const current = await getTask(id);
  if (!current) return;
  const db = await getDb();
  const title = patch.title !== undefined ? patch.title.trim() || current.title : current.title;
  const notes = patch.notes !== undefined ? patch.notes : current.notes;
  const projectId = patch.projectId ?? current.projectId;
  const status = patch.status ?? current.status;
  const dueAt = patch.dueAt !== undefined ? patch.dueAt : current.dueAt;
  const starred = patch.starred !== undefined ? patch.starred : current.starred;
  let sort = current.sort;
  if (status !== current.status || projectId !== current.projectId) {
    const max = await db.getFirstAsync<{ max_sort: number | null }>(
      "SELECT MAX(sort) AS max_sort FROM prod_tasks WHERE project_id = ? AND status = ?",
      projectId,
      status,
    );
    sort = (max?.max_sort ?? -1) + 1;
  }
  await db.runAsync(
    `UPDATE prod_tasks
     SET title = ?, notes = ?, project_id = ?, status = ?, sort = ?, due_at = ?, starred = ?, updated_at = ?
     WHERE id = ?`,
    title,
    notes,
    projectId,
    status,
    sort,
    dueAt,
    starred ? 1 : 0,
    Date.now(),
    id,
  );
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM prod_tasks WHERE id = ?", id);
}

export async function clearDoneTasks(): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync("DELETE FROM prod_tasks WHERE status = ?", "done");
  return result.changes;
}

export async function searchProductivity(query: string): Promise<{
  tasks: ProdTask[];
  projects: ProdProject[];
}> {
  const q = query.trim().toLowerCase();
  const [allTasks, allProjects] = await Promise.all([listTasks(), listProjects()]);
  if (!q) return { tasks: [], projects: [] };
  return {
    tasks: allTasks.filter(
      (task) => task.title.toLowerCase().includes(q) || task.notes.toLowerCase().includes(q),
    ),
    projects: allProjects.filter((project) => project.name.toLowerCase().includes(q)),
  };
}
