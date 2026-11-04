import { space, textSize } from "@/lib/appearance/density";
import { InlineHelp } from "@/components/ui/inline-help";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Check, Trash2 } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTraining } from "@/lib/health/training/training-context";
import { newExercise, newSet, previousExercise, sessionSummary, trainingId, type TrainingExercise, type TrainingSession } from "@/lib/health/training/model";
import { isDateKey } from "@/lib/health/weight/model";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button, Field, Header, SaveState, TrainingLoadState, errorKey, styles } from "./ui";
import { RestCard } from "./rest-card";
import { ExerciseComposer } from "./exercise-composer";

function NumberInput({ value, label, max, integer = false, disabled = false, onChange }: { value: number | null; label: string; max: number; integer?: boolean; disabled?: boolean; onChange(value: number | null): void }) {
  const { t } = useI18n(); const [text, setText] = useState(value === null ? "" : String(value)); const [error, setError] = useState(false);
  useEffect(() => { if ((text === "" ? null : Number(text.replace(",", "."))) !== value) setText(value === null ? "" : String(value)); }, [value]);
  return <View style={{ flex: 1, minWidth: 45 }}><TextInput accessibilityLabel={label} value={text} editable={!disabled} placeholder="—" placeholderTextColor={colors.muted} keyboardType={integer ? "number-pad" : "decimal-pad"} maxLength={8}
    onChangeText={(next) => {
      const valid = integer ? /^\d*$/.test(next) : /^\d*(?:[.,]\d{0,2})?$/.test(next);
      const parsed = next === "" ? null : Number(next.replace(",", "."));
      if (!valid || (parsed !== null && (!Number.isFinite(parsed) || parsed > max || (integer && parsed < 1)))) { setError(true); return; }
      setError(false); setText(next); onChange(parsed);
    }} style={[styles.input, { paddingHorizontal: space(5), textAlign: "center", paddingVertical: space(10), borderColor: error ? colors.danger : colors.rule }]} />
    {error ? <Text accessibilityRole="alert" style={[styles.error, { fontSize: 11 }]}>{t("training.errors.number")}</Text> : null}
  </View>;
}
export function TrainingSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const { t, locale } = useI18n();
  const { sessions, rest, ready, loadFailed, status, change, create, remove, flush, setRest } = useTraining();
  const session = sessions.find((row) => row.id === id);
  const [adding, setAdding] = useState(false); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [editingExercise, setEditingExercise] = useState<TrainingExercise | null>(null);
  const [confirm, setConfirm] = useState<"finish" | "delete" | string | null>(null);
  const [dateText, setDateText] = useState(session?.date ?? "");
  useEffect(() => { if (session) setDateText(session.date); }, [session?.date]);
  function update(next: TrainingSession) { try { change(next); setError(null); } catch (err) { setError(errorKey(err)); } }
  function updateExercise(exercise: TrainingExercise) {
    if (session) update({ ...session, exercises: session.exercises.map((row) => row.id === exercise.id ? exercise : row) });
  }
  async function startRest(exercise: TrainingExercise) {
    if (!session || !exercise.restSec) return;
    try { await setRest({ sessionId: session.id, exerciseName: exercise.name, endsAt: Date.now() + exercise.restSec * 1000 }); }
    catch { setError("training.errors.storage"); }
  }
  async function action() {
    if (!session || busy) return;
    setBusy(true); setError(null);
    try {
      if (confirm === "delete") {
        await remove(session.id); if (rest?.sessionId === session.id) await setRest(null); setConfirm(null); router.replace("/health/training");
      } else if (confirm === "finish") {
        change({ ...session, finishedAt: Date.now() }); await flush();
        if (rest?.sessionId === session.id) await setRest(null); setConfirm(null);
      } else {
        update({ ...session, exercises: session.exercises.filter((exercise) => exercise.id !== confirm) }); setConfirm(null);
      }
    } catch (err) { setError(errorKey(err)); setConfirm(null); }
    finally { setBusy(false); }
  }
  async function repeat() {
    if (!session || busy) return; setBusy(true);
    try { await flush(); const next = await create(session.name, undefined, session); router.push(`/health/training/session/${next.id}`); }
    catch (err) { setError(errorKey(err)); } finally { setBusy(false); }
  }
  const locked = !!session?.finishedAt;
  const names = [...new Set(sessions.flatMap((row) => row.exercises.map((exercise) => exercise.name)))].sort((a, b) => a.localeCompare(b, locale));
  return <><Screen keyboardShouldPersistTaps="handled"><Header title={session?.name || t("training.title")} /><TrainingLoadState />
    {ready && !loadFailed && !session ? <Text style={type.body}>{t("training.missing")}</Text> : null}
    {session && !loadFailed ? <>
      <SaveState />
      <Text style={[type.label, { color: locked ? colors.ok : colors.accent }]}>{t(locked ? "training.finished" : "training.active")}</Text>
      <Field label={t("training.name")} value={session.name} maxLength={120} editable={!locked} onChangeText={(name) => update({ ...session, name })} />
      <Field label={t("training.date")} value={dateText} editable={!locked} maxLength={10} autoCapitalize="none" onChangeText={(text) => {
        setDateText(text); if (isDateKey(text)) update({ ...session, date: text });
      }} onBlur={() => { if (!isDateKey(dateText)) { setDateText(session.date); setError("training.errors.date"); } }} />
      <Text style={type.meta}>{t("training.summary", sessionSummary(session))}</Text>
      <Text style={type.body}>{t("training.volume", { volume: sessionSummary(session).volume.toLocaleString(locale) })}</Text>
      <RestCard />
      {session.exercises.map((exercise) => {
        const previous = previousExercise(sessions, session, exercise.name);
        return <View key={exercise.id} style={styles.card}>
          <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={`${t("training.editExercise")}: ${exercise.name}`} disabled={locked} onPress={() => { setEditingExercise(exercise); setAdding(true); }} style={{ flex: 1, paddingVertical: space(8) }}><Text style={type.sectionTitle}>{exercise.name}</Text></Pressable>
            {!locked ? <Pressable accessibilityRole="button" accessibilityLabel={t("training.removeExercise", { exercise: exercise.name })} onPress={() => setConfirm(exercise.id)} style={{ padding: space(10) }}><Trash2 size={18} color={colors.muted} /></Pressable> : null}</View>
          <Button title={t("trainingAnalytics.forExercise", { exercise: exercise.name })} onPress={() => router.push({ pathname: "/health/training/analytics", params: { exercise: exercise.name } })} />
          <View style={styles.spread}><Text style={type.label}>{t("training.rest")}</Text><View style={{ width: 90 }}>
            <TextInput accessibilityLabel={t("training.restSeconds", { exercise: exercise.name })} value={String(exercise.restSec)} keyboardType="number-pad" editable={!locked} maxLength={3} style={[styles.input, { textAlign: "center" }]}
              onChangeText={(text) => { if (/^\d*$/.test(text) && Number(text) <= 900) updateExercise({ ...exercise, restSec: Number(text) }); }} />
          </View><Text style={type.meta}>s</Text></View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: space(6) }}>
            <Text style={[type.meta, { width: 22 }]}>#</Text><Text style={[type.meta, { flex: 1, textAlign: "center" }]}>{t("training.kg")}</Text><Text style={[type.meta, { flex: 1, textAlign: "center" }]}>{t("training.reps")}</Text>
            <Text style={[type.meta, { width: 55, textAlign: "center" }]}>{t("training.previous")}</Text><View style={{ width: 40 }} />
          </View>
          {exercise.sets.map((set, index) => {
            const prev = previous?.sets[index]; const params = { number: index + 1, exercise: exercise.name };
            const patch = (values: Partial<typeof set>) => updateExercise({ ...exercise, sets: exercise.sets.map((row) => row.id === set.id ? { ...row, ...values } : row) });
            return <View key={set.id} style={{ gap: space(6), paddingBottom: space(10), borderBottomWidth: 1, borderColor: colors.rule }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space(6) }}>
                <Text style={[type.body, { width: 22 }]}>{index + 1}</Text>
                <NumberInput label={t("training.weightLabel", params)} value={set.weightKg} max={1500} disabled={locked} onChange={(weightKg) => patch({ weightKg })} />
                <NumberInput label={t("training.repsLabel", params)} value={set.reps} max={1000} integer disabled={locked} onChange={(reps) => patch({ reps, completed: reps === null ? false : set.completed })} />
                <Text style={[type.meta, { width: 55, textAlign: "center", fontSize: textSize(12) }]}>{prev ? `${prev.weightKg ?? "—"}×${prev.reps}` : "—"}</Text>
                <Pressable accessibilityRole="checkbox" accessibilityLabel={t(set.completed ? "training.unmark" : "training.markDone", params)} accessibilityState={{ checked: set.completed, disabled: locked }} disabled={locked}
                  onPress={() => {
                    if (!set.reps) { setError("training.errors.sets"); return; }
                    patch({ completed: !set.completed }); if (!set.completed) void startRest(exercise);
                  }} style={{ width: 40, minHeight: 44, borderWidth: 1, borderColor: set.completed ? colors.ok : colors.rule, borderRadius: 8, backgroundColor: set.completed ? colors.sheetHover : colors.sheetRaised, alignItems: "center", justifyContent: "center" }}>
                  {set.completed ? <Check size={19} color={colors.ok} /> : <Text style={type.meta}>✓</Text>}
                </Pressable>
              </View>
              <View style={styles.spread}>
                <Pressable accessibilityRole="checkbox" accessibilityLabel={t("training.warmupLabel", params)} accessibilityState={{ checked: set.warmup, disabled: locked }} disabled={locked} onPress={() => patch({ warmup: !set.warmup })} style={{ minHeight: 36, justifyContent: "center" }}>
                  <Text style={[type.meta, { color: set.warmup ? colors.warn : colors.muted }]}>{set.warmup ? "● " : "○ "}{t("training.warmup")}</Text></Pressable>
                {!locked ? <Pressable accessibilityRole="button" accessibilityLabel={t("training.deleteSet", params)} onPress={() => updateExercise({ ...exercise, sets: exercise.sets.filter((row) => row.id !== set.id) })} style={{ padding: space(10) }}><Trash2 size={15} color={colors.muted} /></Pressable> : null}
              </View>
            </View>;
          })}

          {!locked ? <View style={styles.row}><Button title={t("training.addSet")} disabled={exercise.sets.length >= 100} onPress={() => updateExercise({ ...exercise, sets: [...exercise.sets, newSet()] })} />
            <Button title={t("training.startRest")} disabled={!exercise.restSec} onPress={() => void startRest(exercise)} /></View> : null}
        </View>;
      })}
      {!session.exercises.length ? <Text style={type.body}>{t("training.noExercises")}</Text> : null}
      {!locked ? <Button title={t("training.addExercise")} onPress={() => { setEditingExercise(null); setAdding(true); }} /> : null}
      <Field label={t("training.note")} multiline value={session.note} editable={!locked} maxLength={2000} onChangeText={(note) => update({ ...session, note })} />
      <InlineHelp label={t("training.about")}><Text style={type.meta}>{t("training.restHint")}</Text><Text style={type.meta}>{t("training.previousHint")}</Text><Text style={type.meta}>{t("training.volumeHint")}</Text></InlineHelp>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text> : null}
      {!locked ? <Button primary title={t("training.finish")} disabled={busy || status === "error"} onPress={() => {
        if (!isDateKey(dateText)) { setError("training.errors.date"); return; }
        if (!session.name.trim()) { setError("training.errors.name"); return; }
        if (!sessionSummary(session).completed) { setError("training.errors.empty"); return; }
        setConfirm("finish");
      }} /> : <View style={styles.section}><Button primary title={t("training.repeat")} disabled={busy} onPress={() => void repeat()} /><Button title={t("training.reopen")} onPress={() => update({ ...session, finishedAt: null })} /></View>}
      <Button title={t("training.delete")} danger disabled={busy} onPress={() => setConfirm("delete")} />
    </> : null}
  </Screen>
    <ExerciseComposer open={adding} initialName={editingExercise?.name} names={editingExercise ? [] : names} onClose={() => setAdding(false)} onAdd={(name) => {
      if (!session) return;
      if (editingExercise) { updateExercise({ ...editingExercise, name }); return; }
      const previous = previousExercise(sessions, session, name); const exercise = newExercise(name);
      if (previous?.sets.length) { exercise.restSec = previous.restSec; exercise.sets = previous.sets.map((set) => ({ ...set, id: trainingId(), completed: false })); }
      update({ ...session, exercises: [...session.exercises, exercise] });
    }} />
    <ConfirmDialog open={confirm !== null} busy={busy} destructive={confirm !== "finish"} confirmLabel={t(confirm === "finish" ? "training.finish" : "common.delete")} title={t(confirm === "finish" ? "training.finishTitle" : confirm === "delete" ? "training.deleteTitle" : "training.deleteExerciseTitle")}
      message={t(confirm === "finish" ? "training.finishBody" : confirm === "delete" ? "training.deleteBody" : "training.deleteExerciseBody")}
      onConfirm={() => void action()} onCancel={() => { if (!busy) setConfirm(null); }} />
  </>;
}
