import { useMemo } from "react";
import { CalendarDays } from "lucide-react-native";
import { FocusListScreen } from "@/components/productivity/focus-list-screen";
import { isDueToday, isOverdue } from "@/lib/productivity/dates";
import { useVisibleTasks } from "@/lib/productivity/productivity-context";
import { colors } from "@/lib/theme";

export default function TodayScreen() {
  const tasks = useVisibleTasks();
  const today = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status !== "done" && (isDueToday(task.dueAt) || isOverdue(task.dueAt, task.status)),
      ),
    [tasks],
  );
  const count = today.length
    ? `${today.length} ${today.length === 1 ? "tarea" : "tareas"}`
    : "Nada para hoy";

  return (
    <FocusListScreen
      title="Hoy"
      label="Productividad"
      countLabel={count}
      empty="No hay tareas con fecha de hoy ni atrasadas."
      tint="#353029"
      art={<CalendarDays color={colors.accent} size={36} strokeWidth={1.8} />}
      tasks={today}
    />
  );
}
