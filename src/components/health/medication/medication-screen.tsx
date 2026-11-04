import { space } from "@/lib/appearance/density";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pill, ArrowUpRight } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMedication } from "@/lib/health/medication/medication-context";
import { doseSummary, revisionOn, slotsForDay, type DoseSlot, type MedicationPlan } from "@/lib/health/medication/model";
import { medicationAlertsSupported } from "@/lib/health/medication/notifications";
import { isDateKey, localDateKey, shiftDateKey } from "@/lib/health/weight/model";
import { monthDays, shiftMonth } from "@/lib/health/training/model";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts, type } from "@/lib/theme";
import { Button, MedicationHeader, MedicationLoadState, medicationErrorKey, styles } from "./ui";
import { PlanComposer } from "./plan-composer";
import { DoseComposer } from "./dose-composer";

export function MedicationHomeCard() {
  const router = useRouter(); const { t } = useI18n(); const { data, ready, loadFailed } = useMedication();
  const summary = doseSummary(slotsForDay(data, localDateKey()));
  return <Pressable accessibilityRole="button" onPress={() => router.push("/health/medication")} style={[styles.card, styles.spread]}>
    <Pill size={24} color={colors.accent} strokeWidth={1.6} /><View style={{ flex: 1, gap: space(5) }}><Text style={type.sectionTitle}>{t("medication.title")}</Text><Text style={type.meta}>{ready && !loadFailed ? t("medication.summary", summary) : t(ready ? "medication.loadError" : "common.loading")}</Text></View><ArrowUpRight size={20} color={colors.inkSoft} /></Pressable>;
}
function MedicationAlerts() {
  const { t } = useI18n(); const { data, alerts, alertError, setAlerts } = useMedication(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function toggle() {
    if (busy) return; setBusy(true); setError(null);
    try { if (!(await setAlerts(!data.alertsEnabled))) setError("medication.alertDenied"); }
    catch { setError("medication.storageError"); } finally { setBusy(false); }
  }
  return <View style={styles.card}><Text style={type.sectionTitle}>{t("medication.alerts")}</Text>
    {!medicationAlertsSupported ? <Text style={type.meta}>{t("medication.webAlerts")}</Text> : <>
      <Button title={t(data.alertsEnabled ? "medication.disableAlerts" : "medication.enableAlerts")} disabled={busy} onPress={() => void toggle()} />
      {data.alertsEnabled ? <Text style={type.meta}>{t(!alerts.permission ? "medication.alertDenied" : alerts.count ? "medication.alertRange" : "medication.noAlerts", { count: alerts.count, date: alerts.through ?? "—" })}</Text> : null}
      <Text style={type.meta}>{t("medication.alertHorizon")}</Text>
    </>}
    {error || alertError ? <Text accessibilityRole="alert" style={styles.error}>{t(error ?? "medication.alertError")}</Text> : null}
  </View>;
}
function DoseRow({ slot, future, onEdit }: { slot: DoseSlot; future: boolean; onEdit(): void }) {
  const { t } = useI18n(); const { record } = useMedication(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const status = slot.log?.status ?? "pending";
  async function undo() {
    if (busy) return; setBusy(true); setError(null);
    try { await record({ planId: slot.planId, date: slot.date, time: slot.time, status: "pending" }); }
    catch (err) { setError(medicationErrorKey(err)); } finally { setBusy(false); }
  }
  return <View style={styles.card}>
    <View style={styles.spread}><Text style={[type.sectionTitle, { flex: 1 }]}>{slot.snapshot.name}</Text><Text style={[type.meta, { color: status === "taken" ? colors.ok : status === "skipped" ? colors.warn : colors.accent }]}>{t(`medication.${status}`)}</Text></View>
    <Text style={type.body}>{[t(`medication.${slot.snapshot.kind}`), slot.snapshot.dose, slot.time || t("medication.noTime")].filter(Boolean).join(" · ")}</Text>
    {slot.snapshot.note ? <Text style={type.meta}>{slot.snapshot.note}</Text> : null}
    {slot.log?.actualTime ? <Text style={type.meta}>{t("medication.takenAt", { time: slot.log.actualTime })}</Text> : null}
    {slot.log?.note ? <Text style={type.meta}>{slot.log.note}</Text> : null}
    <View style={styles.row}><Button primary={status === "pending"} title={t(status === "pending" ? "medication.record" : "medication.correct")} disabled={future || busy} onPress={onEdit} />
      {status !== "pending" ? <Button title={t("medication.undo")} disabled={future || busy} onPress={() => void undo()} /> : null}</View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text> : null}
  </View>;
}
export function MedicationScreen() {
  const { t, locale } = useI18n(); const { date: requestedDate } = useLocalSearchParams<{ date?: string }>(); const { data, ready, loadFailed, savePlan } = useMedication();
  const [today, setToday] = useState(localDateKey()); const [selected, setSelected] = useState(isDateKey(requestedDate ?? "") ? requestedDate! : today);
  const [month, setMonth] = useState(selected.slice(0, 7)); const [tab, setTab] = useState<"doses" | "calendar" | "plans">("doses");
  const [composer, setComposer] = useState(false); const [editing, setEditing] = useState<MedicationPlan | null>(null); const [editingDose, setEditingDose] = useState<DoseSlot | null>(null);
  const [pausing, setPausing] = useState<MedicationPlan | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [query, setQuery] = useState("");
  const currentDay = useRef(today);
  useEffect(() => {
    const interval = setInterval(() => {
      const next = localDateKey(); const old = currentDay.current;
      if (old === next) return;
      currentDay.current = next; setToday(next); setSelected((day) => day === old ? next : day);
      setMonth((value) => value === old.slice(0, 7) ? next.slice(0, 7) : value);
    }, 30000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => { if (requestedDate && isDateKey(requestedDate)) { setSelected(requestedDate); setMonth(requestedDate.slice(0, 7)); setTab("doses"); } }, [requestedDate]);
  const filteredPlans = data.plans.filter((plan) => {
    const revision = revisionOn(plan, today) ?? plan.revisions.at(-1)!;
    return `${revision.name} ${revision.dose}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));
  });
  const slots = useMemo(() => slotsForDay(data, selected), [data, selected]); const summary = doseSummary(slots);
  const dayText = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const calendar = useMemo(() => monthDays(month).map((day) => ({ day, summary: day ? doseSummary(slotsForDay(data, day)) : null })), [data, month]);
  function selectDate(day: string) { setSelected(day); setMonth(day.slice(0, 7)); }
  function moveMonth(delta: number) { const next = shiftMonth(month, delta); setMonth(next); setSelected(`${next}-01`); }
  async function setActive(plan: MedicationPlan, active: boolean) {
    if (busy) return; setBusy(true); setError(null);
    try { const revision = revisionOn(plan, today) ?? plan.revisions.at(-1)!; await savePlan(revision, plan.id, active); setPausing(null); }
    catch (err) { setError(medicationErrorKey(err)); setPausing(null); } finally { setBusy(false); }
  }
  return <><Screen keyboardShouldPersistTaps="handled"><MedicationHeader /><MedicationLoadState />
    {ready && !loadFailed ? <>
      <View style={styles.row}>{(["doses", "calendar", "plans"] as const).map((value) => <Button key={value} primary={tab === value} title={t(`medication.${value}`)} onPress={() => { setTab(value); setError(null); }} />)}</View>
      {tab !== "plans" ? <>
        {tab === "calendar" ? <View style={styles.card}>
          <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={t("medication.previousMonth")} onPress={() => moveMonth(-1)} style={styles.button}><Text style={styles.buttonText}>‹</Text></Pressable>
            <Text style={[type.sectionTitle, { flex: 1, textAlign: "center" }]}>{new Date(`${month}-01T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t("medication.nextMonth")} onPress={() => moveMonth(1)} style={styles.button}><Text style={styles.buttonText}>›</Text></Pressable></View>
          <View style={{ flexDirection: "row" }}>{Array.from({ length: 7 }, (_, i) => <Text key={i} style={[type.meta, { width: "14.285714%", textAlign: "center" }]}>{new Date(Date.UTC(2026, 10, 2 + i, 12)).toLocaleDateString(locale, { weekday: "narrow", timeZone: "UTC" })}</Text>)}</View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{calendar.map(({ day, summary: count }, index) => <View key={day ?? `blank-${index}`} style={{ width: "14.285714%", padding: 2 }}>
            {day && count ? <Pressable accessibilityRole="button" accessibilityLabel={t("medication.dayLabel", { date: day, ...count })} accessibilityState={{ selected: day === selected }} onPress={() => setSelected(day)}
              style={{ minHeight: 56, gap: 3, borderWidth: 1, borderColor: day === today ? colors.accent : colors.rule, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: day === selected ? colors.accent : "transparent" }}>
              <Text style={{ color: day === selected ? colors.accentText : colors.ink, fontFamily: fonts.sansMedium }}>{Number(day.slice(8))}</Text>
              <Text style={[type.meta, { fontSize: 11, color: day === selected ? colors.accentText : count.skipped ? colors.warn : count.total && count.taken === count.total ? colors.ok : colors.muted }]}>{count.total ? `${count.taken}/${count.total}` : "·"}</Text>
            </Pressable> : null}</View>)}</View>
          <Text style={type.meta}>{t("medication.calendarHint")}</Text>
        </View> : null}
        <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={t("medication.previousDay")} onPress={() => selectDate(shiftDateKey(selected, -1))} style={styles.button}><Text style={styles.buttonText}>‹</Text></Pressable>
          <Text style={[type.sectionTitle, { flex: 1, textAlign: "center" }]}>{dayText(selected)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("medication.nextDay")} onPress={() => selectDate(shiftDateKey(selected, 1))} style={styles.button}><Text style={styles.buttonText}>›</Text></Pressable></View>
        <Button title={t("medication.today")} onPress={() => selectDate(today)} />
        <Text style={type.body}>{t("medication.summary", summary)}</Text>
        {selected > today ? <Text style={type.meta}>{t("medication.futureHint")}</Text> : null}
        {slots.map((slot) => <DoseRow key={slot.id} slot={slot} future={selected > today} onEdit={() => setEditingDose(slot)} />)}
        {!slots.length ? <Text style={type.body}>{t("medication.noDoses")}</Text> : null}
      </> : <>
        <Button primary title={t("medication.new")} onPress={() => { setEditing(null); setComposer(true); }} />
        <TextInput accessibilityLabel={t("medication.search")} placeholder={t("medication.search")} placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={styles.input} />
        {filteredPlans.map((plan) => {
          const revision = revisionOn(plan, today) ?? plan.revisions.at(-1)!;
          return <View key={plan.id} style={styles.card}><View style={styles.spread}><Text style={[type.sectionTitle, { flex: 1 }]}>{revision.name}</Text><Text style={type.meta}>{t(revision.active ? "medication.active" : "medication.paused")}</Text></View>
            <Text style={type.body}>{[t(`medication.${revision.kind}`), revision.dose, t(`medication.${revision.frequency}`), revision.times.join(" · ") || t("medication.noTime")].filter(Boolean).join(" · ")}</Text>
            <Text style={type.meta}>{revision.anchorDate}{revision.endDate ? ` → ${revision.endDate}` : ""}</Text>
            <View style={styles.row}><Button title={t("medication.editPlan", { name: revision.name })} onPress={() => { setEditing(plan); setComposer(true); }} />
              <Button disabled={busy} title={t(revision.active ? "medication.pause" : "medication.resume")} onPress={() => { if (revision.active) setPausing(plan); else void setActive(plan, true); }} /></View></View>;
        })}
        {data.plans.length > 0 && !filteredPlans.length ? <Text style={type.body}>{t("medication.noResults")}</Text> : null}
        {!data.plans.length ? <View style={styles.card}><Text style={type.sectionTitle}>{t("medication.emptyPlans")}</Text><Text style={type.body}>{t("medication.emptyBody")}</Text></View> : null}
      </>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text> : null}
      {tab !== "plans" ? <Button title={t("medication.new")} onPress={() => { setEditing(null); setComposer(true); }} /> : null}
      <MedicationAlerts />
    </> : null}

  </Screen>
    <PlanComposer open={composer} plan={editing} onClose={() => setComposer(false)} /><DoseComposer slot={editingDose} onClose={() => setEditingDose(null)} />
    <ConfirmDialog open={pausing !== null} destructive={false} busy={busy} title={t("medication.pauseTitle")} message={t("medication.pauseBody")} confirmLabel={t("medication.pause")}
      onConfirm={() => { if (pausing) void setActive(pausing, false); }} onCancel={() => { if (!busy) setPausing(null); }} />
  </>;
}
