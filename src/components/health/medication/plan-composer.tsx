import { useThemeId } from "@/lib/appearance/use-theme-id";
import { space } from "@/lib/appearance/density";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useMedication } from "@/lib/health/medication/medication-context";
import { parseTimes, revisionOn, type MedicationPlan, type MedicationKind, type MedicationFrequency } from "@/lib/health/medication/model";
import { localDateKey } from "@/lib/health/weight/model";
import { useI18n } from "@/lib/i18n/context";
import { type } from "@/lib/theme";
import { Button, Field, medicationErrorKey, styles } from "./ui";

export function PlanComposer({ open, plan, onClose }: { open: boolean; plan: MedicationPlan | null; onClose(): void }) {
  useThemeId();
  const { t } = useI18n(); const { savePlan } = useMedication();
  const [name, setName] = useState(""); const [dose, setDose] = useState(""); const [note, setNote] = useState(""); const [times, setTimes] = useState("");
  const [kind, setKind] = useState<MedicationKind>("medication"); const [frequency, setFrequency] = useState<MedicationFrequency>("daily");
  const [anchor, setAnchor] = useState(localDateKey()); const [end, setEnd] = useState(""); const [busy, setBusy] = useState(false); const locked = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const revision = plan ? revisionOn(plan, localDateKey()) ?? plan.revisions.at(-1)! : null;
    setName(revision?.name ?? ""); setDose(revision?.dose ?? ""); setNote(revision?.note ?? ""); setTimes(revision?.times.join(", ") ?? "");
    setKind(revision?.kind ?? "medication"); setFrequency(revision?.frequency ?? "daily"); setAnchor(revision?.anchorDate ?? localDateKey()); setEnd(revision?.endDate ?? ""); setError(null);
  }, [open, plan]);
  async function save() {
    if (locked.current) return; locked.current = true; setBusy(true); setError(null);
    try {
      const active = plan ? (revisionOn(plan, localDateKey()) ?? plan.revisions.at(-1)!).active : true;
      await savePlan({ name, dose, note, kind, frequency, times: parseTimes(times), anchorDate: anchor.trim(), endDate: end.trim() || null }, plan?.id, active);
      onClose();
    } catch (err) { setError(medicationErrorKey(err)); } finally { locked.current = false; setBusy(false); }
  }
  return <BottomSheet open={open} onOpenChange={(next) => { if (!next && !locked.current) onClose(); }} accessibilityCloseLabel={t("medication.close")} viewportRatio={0.94}>
    <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(14) }}>
      <Text style={type.pageTitle}>{t(plan ? "medication.edit" : "medication.new")}</Text>
      <Text style={type.label}>{t("medication.kind")}</Text><View style={styles.row}>{(["medication", "supplement"] as const).map((value) => <Button key={value} primary={kind === value} disabled={busy} title={t(`medication.${value}`)} onPress={() => setKind(value)} />)}</View>
      <Field label={t("medication.name")} value={name} onChangeText={setName} placeholder={t("medication.nameHint")} maxLength={120} editable={!busy} />
      <Field label={t("medication.dose")} value={dose} onChangeText={setDose} placeholder={t("medication.doseHint")} maxLength={120} editable={!busy} />
      <Field label={t("medication.times")} value={times} onChangeText={setTimes} placeholder={t("medication.timesHint")} autoCapitalize="none" maxLength={70} editable={!busy} />
      <Text style={type.meta}>{t("medication.timesHelp")}</Text>
      <Text style={type.label}>{t("medication.frequency")}</Text><View style={styles.row}>{(["daily", "alternate", "weekly", "monthly"] as const).map((value) => <Button key={value} primary={frequency === value} disabled={busy} title={t(`medication.${value}`)} onPress={() => setFrequency(value)} />)}</View>
      <Field label={t("medication.anchor")} value={anchor} onChangeText={setAnchor} placeholder={t("medication.dateHint")} autoCapitalize="none" maxLength={10} editable={!busy} />
      <Field label={t("medication.end")} value={end} onChangeText={setEnd} placeholder={t("medication.dateHint")} autoCapitalize="none" maxLength={10} editable={!busy} />
      <Text style={type.meta}>{t("medication.anchorHelp")}</Text>
      <Field label={t("medication.note")} value={note} onChangeText={setNote} multiline maxLength={2000} editable={!busy} />
      {plan ? <Text style={type.meta}>{t("medication.revisionHint")}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text> : null}
      <Button primary disabled={busy || !name.trim()} title={t(busy ? "health.saving" : "common.save")} onPress={() => void save()} />
    </SheetScrollView>
  </BottomSheet>;
}
