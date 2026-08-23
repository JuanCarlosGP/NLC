import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { dueToday, dueTomorrow } from "@/lib/productivity/dates";
import { useActiveProjects, useProductivity } from "@/lib/productivity/productivity-context";
import { INBOX_PROJECT_ID } from "@/lib/productivity/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

export function TaskComposerSheet({
  open,
  onOpenChange,
  defaultProjectId,
  defaultDue = "none",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string | null;
  defaultDue?: "none" | "today" | "tomorrow";
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar nueva tarea"
      viewportRatio={0.72}
    >
      <TaskComposerBody
        open={open}
        defaultProjectId={defaultProjectId}
        defaultDue={defaultDue}
        onDone={() => onOpenChange(false)}
      />
    </BottomSheet>
  );
}

function TaskComposerBody({
  open,
  defaultProjectId,
  defaultDue,
  onDone,
}: {
  open: boolean;
  defaultProjectId?: string | null;
  defaultDue: "none" | "today" | "tomorrow";
  onDone: () => void;
}) {
  const { createTask } = useProductivity();
  const projects = useActiveProjects();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId || INBOX_PROJECT_ID);
  const [due, setDue] = useState<"none" | "today" | "tomorrow">(defaultDue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setNotes("");
    setProjectId(defaultProjectId || INBOX_PROJECT_ID);
    setDue(defaultDue);
    setBusy(false);
  }, [defaultDue, defaultProjectId, open]);

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await createTask({
        title,
        notes,
        projectId,
        dueAt: due === "today" ? dueToday() : due === "tomorrow" ? dueTomorrow() : null,
      });
      triggerUiHaptic();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={type.sectionTitle}>Nueva tarea</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Título"
        placeholderTextColor={colors.muted}
        autoFocus
        style={styles.input}
        onSubmitEditing={() => void submit()}
        returnKeyType="done"
      />
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Notas (opcional)"
        placeholderTextColor={colors.muted}
        multiline
        style={[styles.input, styles.notes]}
      />
      <Text style={type.label}>Proyecto</Text>
      <View style={styles.chips}>
        {projects.map((project) => {
          const active = project.id === projectId;
          return (
            <Pressable
              key={project.id}
              onPress={() => {
                triggerUiHaptic();
                setProjectId(project.id);
              }}
              style={[styles.chip, active && styles.chipOn]}
            >
              <View style={[styles.dot, { backgroundColor: project.color }]} />
              <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{project.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={type.label}>Fecha</Text>
      <View style={styles.chips}>
        {(
          [
            ["none", "Sin fecha"],
            ["today", "Hoy"],
            ["tomorrow", "Mañana"],
          ] as const
        ).map(([id, label]) => {
          const active = due === id;
          return (
            <Pressable
              key={id}
              onPress={() => {
                triggerUiHaptic();
                setDue(id);
              }}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={!title.trim() || busy}
        onPress={() => void submit()}
        style={({ pressed }) => [
          styles.submit,
          { opacity: !title.trim() || busy ? 0.4 : pressed ? 0.86 : 1 },
        ]}
      >
        <Text style={styles.submitText}>{busy ? "…" : "Crear"}</Text>
      </Pressable>
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheetRaised,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  notes: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.sheet,
  },
  chipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  chipLabelOn: { color: colors.void },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  submit: {
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
  },
  submitText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.accentText,
  },
});
