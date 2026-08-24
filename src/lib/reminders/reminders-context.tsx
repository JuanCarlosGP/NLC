import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { router } from "expo-router";
import {
  removeReminderNotification,
  subscribeReminderNotifications,
  syncAllReminderNotifications,
  syncReminderNotification,
} from "@/lib/reminders/notifications";
import { setReminderOpenHandler } from "@/lib/reminders/open";
import {
  createReminder as persistCreate,
  deleteReminder as persistDelete,
  listReminders,
  updateReminder as persistUpdate,
  type ReminderInput,
} from "@/lib/reminders/store";
import type { ProdReminder } from "@/lib/reminders/types";

type RemindersContextValue = {
  ready: boolean;
  reminders: ProdReminder[];
  refresh: () => Promise<void>;
  createReminder: (input: ReminderInput) => Promise<ProdReminder>;
  updateReminder: (id: string, patch: Partial<ReminderInput>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
};

const RemindersContext = createContext<RemindersContextValue | null>(null);

export function RemindersProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [reminders, setReminders] = useState<ProdReminder[]>([]);

  const refresh = useCallback(async () => {
    const next = await listReminders();
    setReminders(next);
    setReady(true);
    void syncAllReminderNotifications(next);
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

  useEffect(() => {
    const unsubOpen = setReminderOpenHandler(() => {
      router.push("/focus/reminders");
    });
    const unsubTap = subscribeReminderNotifications();
    return () => {
      unsubOpen();
      unsubTap();
    };
  }, []);

  const createReminder = useCallback(
    async (input: ReminderInput) => {
      const reminder = await persistCreate(input);
      await syncReminderNotification(reminder, true);
      await refresh();
      return reminder;
    },
    [refresh],
  );

  const updateReminder = useCallback(
    async (id: string, patch: Partial<ReminderInput>) => {
      await persistUpdate(id, patch);
      const next = await listReminders();
      const reminder = next.find((item) => item.id === id);
      if (reminder) await syncReminderNotification(reminder, Boolean(patch.enabled));
      else await removeReminderNotification(id);
      setReminders(next);
    },
    [],
  );

  const deleteReminder = useCallback(async (id: string) => {
    await persistDelete(id);
    await removeReminderNotification(id);
    setReminders((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(
    () => ({ ready, reminders, refresh, createReminder, updateReminder, deleteReminder }),
    [createReminder, deleteReminder, ready, refresh, reminders, updateReminder],
  );

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders(): RemindersContextValue {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error("useReminders must be used within RemindersProvider");
  return ctx;
}
