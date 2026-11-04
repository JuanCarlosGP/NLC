import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles } from "@/lib/appearance/density";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text, TextInput } from "@/components/ui/themed-text";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { localDateKey, WeightValidationError, type WeightEntry } from "@/lib/health/weight/model";
import { useWeight } from "@/lib/health/weight/weight-context";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts, type } from "@/lib/theme";
import { triggerUiHaptic } from "@/lib/ui-haptics";

export function WeightComposerSheet({ open, entry, onOpenChange }: {
  open: boolean; entry?: WeightEntry | null; onOpenChange(open: boolean): void;
}) {
  useThemeId();
  const { t } = useI18n();
  const { entries, save } = useWeight();
  const [date, setDate] = useState(localDateKey());
  const [kg, setKg] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!open) return;
    setDate(entry?.entryDate ?? localDateKey());
    setKg(entry ? String(entry.weightKg) : "");
    setNote(entry?.note ?? "");
    setErrorKey(null);
  }, [open, entry]);

  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setErrorKey(null);
    try {
      await save({ entryDate: date.trim(), weightKg: kg, note }, entry?.entryDate);
      triggerUiHaptic();
      onOpenChange(false);
    } catch (error) {
      setErrorKey(error instanceof WeightValidationError ? `health.errors.${error.code}` : "health.saveFailed");
    } finally { submitting.current = false; setBusy(false); }
  }

  const replacing = !entry && entries.some((row) => row.entryDate === date.trim());
  return (
    <BottomSheet open={open} onOpenChange={(next) => { if (!submitting.current) onOpenChange(next); }}
      accessibilityCloseLabel={t("health.closeEditor")} viewportRatio={0.82}>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={type.pageTitle}>{t(entry ? "health.editWeight" : "health.addWeight")}</Text>
        <Text style={type.meta}>{t("health.dailyHint")}</Text>
        <View style={styles.labelRow}>
          <Text style={type.label}>{t("health.date")}</Text>
          <Pressable accessibilityRole="button" onPress={() => setDate(localDateKey())} disabled={busy}>
            <Text style={styles.today}>{t("health.today")}</Text>
          </Pressable>
        </View>
        <TextInput accessibilityLabel={t("health.date")} value={date} onChangeText={setDate}
          placeholder={t("health.dateHint")} placeholderTextColor={colors.muted} maxLength={10}
          autoCorrect={false} autoCapitalize="none" editable={!busy} style={styles.input} />
        <Text style={type.label}>{t("health.kg")}</Text>
        <TextInput accessibilityLabel={t("health.kg")} value={kg} onChangeText={setKg}
          placeholder={t("health.kgHint")} placeholderTextColor={colors.muted} keyboardType="decimal-pad"
          editable={!busy} maxLength={8} style={[styles.input, styles.weight]} />
        <Text style={type.label}>{t("health.note")}</Text>
        <TextInput accessibilityLabel={t("health.note")} value={note} onChangeText={setNote}
          placeholder={t("health.noteHint")} placeholderTextColor={colors.muted} multiline maxLength={1000}
          editable={!busy} style={[styles.input, styles.note]} />
        {replacing ? <Text style={styles.hint}>{t("health.replaceHint")}</Text> : null}
        {errorKey ? <Text accessibilityRole="alert" style={styles.error}>{t(errorKey)}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy || !kg.trim()} onPress={() => void submit()}
          style={({ pressed }) => [styles.submit, { opacity: busy || !kg.trim() ? 0.4 : pressed ? 0.86 : 1 }]}>
          <Text style={styles.submitText}>{t(busy ? "health.saving" : "health.save")}</Text>
        </Pressable>
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = createStyles(() => ({
  scroll: { flex: 1 }, content: { paddingHorizontal: 22, paddingBottom: 28, gap: 12 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  today: { fontFamily: fonts.sansMedium, color: colors.accent, padding: 6 },
  input: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheetRaised, color: colors.ink,
    fontFamily: fonts.sans, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8 },
  weight: { fontFamily: fonts.serif, fontSize: 30 }, note: { minHeight: 72, textAlignVertical: "top" },
  hint: { ...type.meta, color: colors.warn }, error: { ...type.body, color: colors.danger },
  submit: { minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14 },
  submitText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.accentText },
}));
