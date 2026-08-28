import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useI18n } from "@/lib/i18n/context";
import { useProductivity } from "@/lib/productivity/productivity-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

export function ProjectComposerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("projects.closeNewProject")}
      viewportRatio={0.42}
    >
      <ProjectComposerBody open={open} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

function ProjectComposerBody({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const { createProject } = useProductivity();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setBusy(false);
  }, [open]);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createProject(name);
      triggerUiHaptic();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={type.sectionTitle}>{t("projects.newProject")}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t("projects.name")}
        placeholderTextColor={colors.muted}
        autoFocus
        style={styles.input}
        onSubmitEditing={() => void submit()}
        returnKeyType="done"
      />
      <Pressable
        accessibilityRole="button"
        disabled={!name.trim() || busy}
        onPress={() => void submit()}
        style={({ pressed }) => [
          styles.submit,
          { opacity: !name.trim() || busy ? 0.4 : pressed ? 0.86 : 1 },
        ]}
      >
        <Text style={styles.submitText}>{busy ? "…" : t("common.create")}</Text>
      </Pressable>
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 14,
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
  submit: {
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
