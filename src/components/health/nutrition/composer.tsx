import { useThemeId } from "@/lib/appearance/use-theme-id";
import { space } from "@/lib/appearance/density";
import { useEffect, useRef, useState } from "react";
import { Text } from "@/components/ui/themed-text";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useNutrition } from "@/lib/health/nutrition/nutrition-context";
import { MACROS, NutritionError, type NutritionDay } from "@/lib/health/nutrition/model";
import { useI18n } from "@/lib/i18n/context";
import { type } from "@/lib/theme";
import { Button, Field, styles } from "../training/ui";
export function nutritionError(error: unknown, t: (key: string, params?: Record<string, string | number>) => string) {
  const message = t(error instanceof NutritionError ? `nutrition.errors.${error.code}` : "nutrition.storageError");
  return error instanceof NutritionError && error.line ? t("nutrition.errorLine", { line: error.line, message }) : message;
}
export function NutritionComposer({ open, entry, date: initial, onClose, onSaved }: { open: boolean; entry: NutritionDay | null; date: string; onClose(): void; onSaved(date: string): void }) {
  useThemeId();
  const { t } = useI18n(); const { save } = useNutrition(); const [date, setDate] = useState(initial); const [note, setNote] = useState("");
  const [values, setValues] = useState({ calories: "", protein: "", carbs: "", fat: "" }); const [busy, setBusy] = useState(false); const locked = useRef(false); const [error, setError] = useState("");
  useEffect(() => { if (open) { setDate(entry?.date ?? initial); setNote(entry?.note ?? ""); setValues({ calories: entry ? String(entry.calories) : "", protein: entry ? String(entry.protein) : "", carbs: entry ? String(entry.carbs) : "", fat: entry ? String(entry.fat) : "" }); setError(""); } }, [open, entry?.date, initial]);
  async function submit() {
    if (locked.current) return; locked.current = true; setBusy(true); setError("");
    try { await save({ date: date.trim(), note, ...values }, entry?.date); onSaved(date.trim()); onClose(); }
    catch (err) { setError(nutritionError(err, t)); } finally { locked.current = false; setBusy(false); }
  }
  return <BottomSheet open={open} onOpenChange={(next) => { if (!next && !locked.current) onClose(); }} accessibilityCloseLabel={t("nutrition.close")} viewportRatio={0.88}>
    <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(16) }}>
      <Text style={type.pageTitle}>{t(entry ? "nutrition.edit" : "nutrition.add")}</Text>
      <Field label={t("nutrition.date")} value={date} onChangeText={setDate} maxLength={10} autoCapitalize="none" editable={!busy} />
      {MACROS.map((key) => <Field key={key} label={`${t(`nutrition.${key}`)} · ${key === "calories" ? "kcal" : "g"}`} value={values[key]} onChangeText={(value) => setValues((old) => ({ ...old, [key]: value }))} keyboardType="decimal-pad" maxLength={12} editable={!busy} />)}
      <Field label={t("nutrition.note")} value={note} onChangeText={setNote} maxLength={2000} multiline editable={!busy} />
      {entry?.source === "macrofactor" ? <Text style={type.meta}>{t("nutrition.editImported")}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button primary disabled={busy} title={t(busy ? "health.saving" : "nutrition.save")} onPress={() => void submit()} />
    </SheetScrollView>
  </BottomSheet>;
}
