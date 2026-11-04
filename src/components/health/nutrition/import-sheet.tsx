import { space } from "@/lib/appearance/density";
import { InlineHelp } from "@/components/ui/inline-help";
import { useEffect, useRef, useState } from "react";
import { Switch, Text, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useNutrition } from "@/lib/health/nutrition/nutrition-context";
import { importPreview, type ImportedDay } from "@/lib/health/nutrition/model";
import { parseMacroFactor } from "@/lib/health/nutrition/macrofactor";
import { pickNutritionCsv } from "@/lib/health/nutrition/picker";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button, Field, styles } from "../training/ui";
import { nutritionError } from "./composer";
export function NutritionImport({ open, onClose, onDone }: { open: boolean; onClose(): void; onDone(message: string, date: string): void }) {
  const { t, locale } = useI18n(); const { entries, importDays } = useNutrition();
  const [incoming, setIncoming] = useState<ImportedDay[] | null>(null); const [name, setName] = useState(""); const [csv, setCsv] = useState(""); const [paste, setPaste] = useState(false); const [replace, setReplace] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const locked = useRef(false);
  useEffect(() => { if (open) { setIncoming(null); setName(""); setCsv(""); setPaste(false); setReplace(false); setError(""); } }, [open]);
  const preview = incoming ? importPreview(entries, incoming, replace) : null;
  async function choose() {
    if (locked.current) return; locked.current = true; setBusy(true); setError("");
    try { const selected = await pickNutritionCsv(); if (selected) { const parsed = parseMacroFactor(selected.text); setIncoming(parsed); setName(selected.name); setReplace(false); setPaste(false); } }
    catch (err) { setError(nutritionError(err, t)); } finally { locked.current = false; setBusy(false); }
  }
  function review() { setError(""); try { setIncoming(parseMacroFactor(csv)); setName(t("nutrition.paste")); setReplace(false); } catch (err) { setError(nutritionError(err, t)); } }
  async function apply() {
    if (!incoming || locked.current) return; locked.current = true; setBusy(true); setError("");
    try { const { result } = await importDays(incoming, replace); onDone(t("nutrition.importDone", result), incoming[0].date); onClose(); }
    catch (err) { setError(nutritionError(err, t)); } finally { locked.current = false; setBusy(false); }
  }
  return <BottomSheet open={open} onOpenChange={(next) => { if (!next && !locked.current) onClose(); }} accessibilityCloseLabel={t("nutrition.close")} viewportRatio={0.9}>
    <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(16) }}>
      <Text style={type.pageTitle}>{t("nutrition.import")}</Text><Text style={type.body}>{t("nutrition.importIntro")}</Text>
      {!incoming ? <>
        <InlineHelp label={t("nutrition.formatTitle")}><Text style={type.meta}>{t("nutrition.format")}</Text></InlineHelp>
        <Button primary disabled={busy} title={t("nutrition.choose")} onPress={() => void choose()} />
        <Button disabled={busy} title={t("nutrition.paste")} onPress={() => setPaste(!paste)} />
        {paste ? <><Field label={t("nutrition.pasteLabel")} value={csv} onChangeText={setCsv} multiline autoCapitalize="none" autoCorrect={false} editable={!busy} style={{ minHeight: 140, textAlignVertical: "top" }} />
          <Button disabled={busy || !csv.trim()} title={t("nutrition.preview")} onPress={review} /></> : null}
      </> : <>
        <Text style={type.label}>{t("nutrition.previewTitle")} · {name}</Text>
        <Text style={type.body}>{t("nutrition.importRange", { count: incoming.length, from: incoming[incoming.length - 1].date, to: incoming[0].date })}</Text>
        <View style={styles.card}>
          <View style={styles.spread}><Text style={[type.body, { flex: 1 }]}>{t("nutrition.replace")}</Text><Switch accessibilityLabel={t("nutrition.replace")} value={replace} onValueChange={setReplace} disabled={busy} trackColor={{ true: colors.accent }} /></View>
          <Text style={type.meta}>{t("nutrition.replaceHint")}</Text>
          <Text style={type.body}>{t("nutrition.importCounts", preview!)}</Text>
          {preview!.manual ? <Text style={[type.body, { color: colors.danger }]}>{t("nutrition.manualWarning", { count: preview!.manual })}</Text> : null}
        </View>
        {incoming.slice(0, 14).map((day) => <View key={day.date} style={styles.spread}><Text style={type.body}>{day.date}</Text><View style={{ alignItems: "flex-end" }}><Text style={type.body}>{day.calories} kcal</Text><Text style={type.meta}>{t("nutrition.foodMacros", { protein: day.protein.toLocaleString(locale), carbs: day.carbs.toLocaleString(locale), fat: day.fat.toLocaleString(locale) })}</Text></View></View>)}
        {incoming.length > 14 ? <Text style={type.meta}>{t("nutrition.previewMore", { count: incoming.length - 14 })}</Text> : null}
        <Button primary disabled={busy} title={t(busy ? "health.saving" : "nutrition.apply")} onPress={() => void apply()} />
        <Button disabled={busy} title={t("nutrition.changeFile")} onPress={() => { setIncoming(null); setError(""); }} />
      </>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button disabled={busy} title={t("nutrition.cancel")} onPress={onClose} />
    </SheetScrollView>
  </BottomSheet>;
}
