import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { ProdTask } from "@/lib/productivity/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";

type TaskActionsContextValue = {
  open: boolean;
  task: ProdTask | null;
  setOpen: (open: boolean) => void;
  openTaskActions: (task: ProdTask) => void;
};

const TaskActionsContext = createContext<TaskActionsContextValue | null>(null);

export function TaskActionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<ProdTask | null>(null);

  const openTaskActions = useCallback((next: ProdTask) => {
    triggerUiHaptic();
    setTask(next);
    setOpen(true);
  }, []);

  return (
    <TaskActionsContext.Provider value={{ open, task, setOpen, openTaskActions }}>
      {children}
    </TaskActionsContext.Provider>
  );
}

export function useTaskActions(): TaskActionsContextValue {
  const ctx = useContext(TaskActionsContext);
  if (!ctx) throw new Error("useTaskActions must be used within TaskActionsProvider");
  return ctx;
}
