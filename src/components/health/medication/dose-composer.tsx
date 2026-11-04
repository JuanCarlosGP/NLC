import { useThemeId } from "@/lib/appearance/use-theme-id";
import { space } from "@/lib/appearance/density";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useMedication } from "@/lib/health/medication/medication-context";
import { timeText, type DoseSlot } from "@/lib/health/medication/model";
import { localDateKey } from "@/lib/health/weight/model";
import { useI18n } from "@/lib/i18n/context";
import { type } from "@/lib/theme";
import { Button, Field, medicationErrorKey, styles } from "./ui";

export function DoseComposer({ slot, onClose }: { slot: DoseSlot | null; onClose(): void }) {
  useThemeId();
  const { t } = useI18n(); const { record } = useMedication();
  const [status, setStatus] = useState<"taken" | "skipped">("taken"); const [actualTime, setTime] = useState(""); const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const locked = useRef(false);
  useEffect(() => {
    if (!slot) return;
    setStatus(slot.log?.status === "skipped" ? "skipped" : "taken");
    setTime(slot.log?.actualTime ?? (slot.date === localDateKey() ? timeText() : slot.time || "12:00"));
    setNote(slot.log?.note ?? ""); setError(null);
  }, [slot]);
  async function save() {
    if (!slot || locked.current) return; locked.current = true; setBusy(true); setError(null);
    try { await record({ planId: slot.planId, date: slot.date, time: slot.time, status, actualTime: actualTime.trim(), note }); onClose(); }
    catch (err) { setError(medicationErrorKey(err)); } finally { locked.current = false; setBusy(false); }
  }
  return <BottomSheet open={slot !== null} onOpenChange={(next) => { if (!next && !locked.current) onClose(); }} accessibilityCloseLabel={t("medication.close")} viewportRatio={0.8}>
    <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(14) }}>
      <Text style={type.label}>{t("medication.logTitle")}</Text><Text style={type.pageTitle}>{slot?.snapshot.name}</Text>
      <Text style={type.body}>{slot?.date} · {slot?.snapshot.dose} · {slot?.time || t("medication.noTime")}</Text>
      <View style={styles.row}>{(["taken", "skipped"] as const).map((value) => <Button key={value} primary={status === value} disabled={busy} title={t(`medication.${value}`)} onPress={() => setStatus(value)} />)}</View>
      {status === "taken" ? <Field label={t("medication.actualTime")} value={actualTime} onChangeText={setTime} placeholder="HH:MM" maxLength={5} editable={!busy} /> : <Text style={type.meta}>{t("medication.skippedHint")}</Text>}
      <Field label={t("medication.logNote")} value={note} onChangeText={setNote} multiline maxLength={2000} editable={!busy} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text> : null}
      <Button primary disabled={busy} title={t(busy ? "health.saving" : "medication.saveLog")} onPress={() => void save()} />
    </SheetScrollView>
  </BottomSheet>;
}
