import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { subscribeAssistantMutations } from "@/lib/cursor/assistant-bus";
import {
  archiveProject as persistArchive,
  clearDoneTasks as persistClearDone,
  createProject as persistCreateProject,
  createTask as persistCreateTask,
  deleteTask as persistDelete,
  ensureInbox,
  listProjects,
  listTasks,
  updateTask as persistUpdate,
} from "@/lib/productivity/store";
import {
  INBOX_PROJECT_ID,
  type ProdProject,
  type ProdTask,
  type TaskStatus,
} from "@/lib/productivity/types";

type CreateTaskInput = {
  title: string;
  projectId?: string;
  notes?: string;
  dueAt?: number | null;
  status?: TaskStatus;
};

type ProductivityContextValue = {
  ready: boolean;
  projects: ProdProject[];
  tasks: ProdTask[];
  inbox: ProdProject | null;
  refresh: () => Promise<void>;
  createProject: (name: string) => Promise<ProdProject>;
  archiveProject: (id: string, archived?: boolean) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<ProdTask>;
  updateTask: (
    id: string,
    patch: {
      title?: string;
      notes?: string;
      projectId?: string;
      status?: TaskStatus;
      dueAt?: number | null;
      starred?: boolean;
    },
  ) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearDone: () => Promise<number>;
};

const ProductivityContext = createContext<ProductivityContextValue | null>(null);

export function ProductivityProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<ProdProject[]>([]);
  const [tasks, setTasks] = useState<ProdTask[]>([]);

  const refresh = useCallback(async () => {
    await ensureInbox();
    const [nextProjects, nextTasks] = await Promise.all([
      listProjects({ includeArchived: true }),
      listTasks({ includeArchived: true }),
    ]);
    setProjects(nextProjects);
    setTasks(nextTasks);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh().catch(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => subscribeAssistantMutations(() => { void refresh(); }), [refresh]);

  const createProject = useCallback(
    async (name: string) => {
      const project = await persistCreateProject(name);
      await refresh();
      return project;
    },
    [refresh],
  );

  const archiveProject = useCallback(
    async (id: string, archived = true) => {
      await persistArchive(id, archived);
      await refresh();
    },
    [refresh],
  );

  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      const task = await persistCreateTask(input);
      await refresh();
      return task;
    },
    [refresh],
  );

  const updateTask = useCallback(
    async (
      id: string,
      patch: {
        title?: string;
        notes?: string;
        projectId?: string;
        status?: TaskStatus;
        dueAt?: number | null;
        starred?: boolean;
      },
    ) => {
      await persistUpdate(id, patch);
      await refresh();
    },
    [refresh],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await persistDelete(id);
      await refresh();
    },
    [refresh],
  );

  const clearDone = useCallback(async () => {
    const removed = await persistClearDone();
    await refresh();
    return removed;
  }, [refresh]);

  const inbox = useMemo(
    () => projects.find((project) => project.id === INBOX_PROJECT_ID) ?? null,
    [projects],
  );

  const value = useMemo(
    () => ({
      ready,
      projects,
      tasks,
      inbox,
      refresh,
      createProject,
      archiveProject,
      createTask,
      updateTask,
      deleteTask,
      clearDone,
    }),
    [
      archiveProject,
      clearDone,
      createProject,
      createTask,
      deleteTask,
      inbox,
      projects,
      ready,
      refresh,
      tasks,
      updateTask,
    ],
  );

  return <ProductivityContext.Provider value={value}>{children}</ProductivityContext.Provider>;
}

export function useProductivity(): ProductivityContextValue {
  const ctx = useContext(ProductivityContext);
  if (!ctx) throw new Error("useProductivity must be used within ProductivityProvider");
  return ctx;
}

export function useActiveProjects(): ProdProject[] {
  const { projects } = useProductivity();
  return useMemo(() => projects.filter((project) => !project.archived), [projects]);
}

export function useVisibleTasks(): ProdTask[] {
  const { projects, tasks } = useProductivity();
  return useMemo(() => {
    const hidden = new Set(projects.filter((project) => project.archived).map((project) => project.id));
    return tasks.filter((task) => !hidden.has(task.projectId));
  }, [projects, tasks]);
}
