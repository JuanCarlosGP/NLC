import { useThemeId } from "@/lib/appearance/use-theme-id";
import { densityData, space, radius } from "@/lib/appearance/density";
import { InlineHelp } from "@/components/ui/inline-help";
import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, Trophy } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { useTraining } from "@/lib/health/training/training-context";
import { exerciseKey, periodPoints, progressSummary, roundTraining, trainingAnalytics, weeklyVolume, type ExerciseAnalytics, type MarkKind, type ProgressMetric, type TrainingPeriod, type TrainingMark } from "@/lib/health/training/analytics";
import { localDateKey } from "@/lib/health/weight/model";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button, Header, SaveState, TrainingLoadState, styles } from "../ui";
import { AnalyticsExercisePicker } from "./exercise-picker";
import { ProgressChart } from "./progress-chart";

const RECORD_LABELS: Record<MarkKind, string> = { load: "recordLoad", volume: "recordVolume", setVolume: "recordSetVolume", reps: "recordReps", estimated: "recordEstimated" };
function Records({ exercise }: { exercise: ExerciseAnalytics }) {
  useThemeId();
  const { t, locale } = useI18n(); const router = useRouter();
  const num = (value: number) => roundTraining(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  function details(mark: TrainingMark) {
    const ref = mark.reference;
    return ref.weightKg === null ? t("trainingAnalytics.bodyweightDetail", { reps: ref.reps }) : ref.weightKg === 0 ? t("trainingAnalytics.zeroDetail", { reps: ref.reps }) : t("trainingAnalytics.setDetail", { weight: num(ref.weightKg), reps: ref.reps });
  }
  return <View style={styles.section}>
    <View style={styles.row}><Trophy size={21} color={colors.accent} /><Text style={type.sectionTitle}>{t("trainingAnalytics.records")}</Text></View>

    <View {...densityData("record-cards")} style={{ gap: space(12) }}>
    {(["load", "setVolume", "volume", "reps", "estimated"] as const).map((kind) => {
      const mark = exercise.records[kind]; const unit = kind === "reps" ? t("trainingAnalytics.repsUnit") : kind === "volume" || kind === "setVolume" ? t("trainingAnalytics.kgReps") : "kg";
      return <View key={kind} style={styles.card}>
        <Text style={type.label}>{t(`trainingAnalytics.${RECORD_LABELS[kind]}`)}</Text>
        {mark ? <>
          <Text style={type.sectionTitle}>{num(mark.value)} {unit}</Text>
          <Text style={type.meta}>{new Date(`${mark.reference.date}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · {mark.reference.sessionName || t("training.title")}</Text>
          {kind !== "volume" ? <Text style={type.body}>{details(mark)}</Text> : null}
          <Button title={t("trainingAnalytics.openSession")} onPress={() => router.push(`/health/training/session/${mark.reference.sessionId}`)} />
        </> : <Text style={type.meta}>{t("trainingAnalytics.noRecord")}</Text>}

      </View>;
    })}
    </View>
  </View>;
}
export function TrainingAnalyticsScreen() {
  useThemeId();
  const router = useRouter(); const params = useLocalSearchParams<{ exercise?: string }>(); const { t, locale } = useI18n(); const { sessions, ready, loadFailed, status } = useTraining();
  const requested = typeof params.exercise === "string" ? exerciseKey(params.exercise) : "";
  const [today, setToday] = useState(localDateKey()); const [selected, setSelected] = useState(requested); const [picker, setPicker] = useState(false); const [period, setPeriod] = useState<TrainingPeriod>("90"); const [metric, setMetric] = useState<ProgressMetric>("load"); const [limit, setLimit] = useState(20);
  useEffect(() => setSelected(requested), [requested]);
  useEffect(() => { const update = () => setToday(localDateKey()); const timer = setInterval(update, 30000); const sub = AppState.addEventListener("change", update); return () => { clearInterval(timer); sub.remove(); }; }, []);
  useEffect(() => setLimit(20), [selected, period]);
  const exercises = useMemo(() => trainingAnalytics(sessions, today), [sessions, today]);
  const exercise = selected ? exercises.find((row) => row.key === selected) : exercises[0];
  const points = useMemo(() => exercise ? periodPoints(exercise.points, period, today) : [], [exercise, period, today]);
  const summary = progressSummary(points); const weekly = exercise ? weeklyVolume(exercise.points, period, today).slice(-8) : []; const maxWeekly = Math.max(1, ...weekly.map((row) => row.volume ?? 0));
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const num = (value: number) => roundTraining(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  return <><Screen>
    <Header title={t("trainingAnalytics.title")} />
    <TrainingLoadState />
    {ready && !loadFailed ? <>
      {status !== "saved" ? <View style={styles.card}><Text style={type.meta}>{t("trainingAnalytics.dirty")}</Text><SaveState /></View> : null}
      {!exercise ? <View style={styles.card}><Text style={type.sectionTitle}>{selected ? t("trainingAnalytics.emptyExercise", { exercise: params.exercise ?? selected }) : t("trainingAnalytics.empty")}</Text><Text style={type.body}>{t("trainingAnalytics.emptyBody")}</Text>{exercises.length ? <Button title={t("trainingAnalytics.choose")} onPress={() => setPicker(true)} /> : null}<Button title={t("training.viewAll")} onPress={() => router.push("/health/training")} /></View> : <>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("trainingAnalytics.choose")}: ${exercise.name}`} onPress={() => setPicker(true)} style={[styles.card, styles.spread]}>
          <View style={{ flex: 1, gap: space(5) }}><Text style={type.label}>{t("trainingAnalytics.exercise")}</Text><Text style={type.sectionTitle}>{exercise.name}</Text></View><ChevronDown size={22} color={colors.accent} />
        </Pressable>
        <InlineHelp label={t("trainingAnalytics.about")}><Text style={type.meta}>{t("trainingAnalytics.rules")}</Text><Text style={type.meta}>{t("trainingAnalytics.volumeHint")}</Text><Text style={type.meta}>{t("trainingAnalytics.recordsHint")}</Text><Text style={type.meta}>{t("trainingAnalytics.recordRepsHint")}</Text><Text style={type.meta}>{t("trainingAnalytics.estimatedHint")}</Text><Text style={type.meta}>{t("trainingAnalytics.weeklyHint")}</Text></InlineHelp>
        <View style={styles.section}><Text style={type.label}>{t("trainingAnalytics.period")}</Text><View style={styles.row}>{(["30", "90", "365", "all"] as const).map((value) => <Button key={value} primary={period === value} title={t(value === "all" ? "trainingAnalytics.all" : `trainingAnalytics.days${value}`)} onPress={() => setPeriod(value)} />)}</View></View>
        <View style={styles.card}><Text style={type.sectionTitle}>{t("trainingAnalytics.periodSummary")}</Text><View style={styles.row}>
          {[{ label: "sessions", value: String(summary.sessions) }, { label: "sets", value: String(summary.sets) }, { label: "repetitions", value: num(summary.repetitions) }, { label: "volume", value: summary.volume === null ? "—" : `${num(summary.volume)} ${t("trainingAnalytics.kgReps")}` }].map((item) => <View key={item.label} style={{ flexGrow: 1, flexBasis: "43%", gap: space(5), paddingVertical: space(6) }}><Text style={type.meta}>{t(`trainingAnalytics.${item.label}`)}</Text><Text style={type.sectionTitle}>{item.value}</Text></View>)}
        </View>
          {summary.sets > summary.loadedSets ? <Text style={type.meta}>{t("trainingAnalytics.unloaded", { count: summary.sets - summary.loadedSets })}</Text> : null}
          {summary.missingLoadSets ? <Text style={type.meta}>{t("trainingAnalytics.missing", { count: summary.missingLoadSets })}</Text> : null}
        </View>
        {!points.length ? <Text style={type.body}>{t("trainingAnalytics.noPeriod")}</Text> : <>
          <Text style={type.sectionTitle}>{t("trainingAnalytics.progression")}</Text>
          <View style={styles.row}>{(["load", "volume", "reps", "estimated"] as const).map((value) => <Button key={value} primary={metric === value} title={t(`trainingAnalytics.${value}`)} onPress={() => setMetric(value)} />)}</View>
          <ProgressChart key={`${exercise.key}:${period}:${metric}:${points.length}`} points={points} metric={metric} />
          <View style={styles.card}><Text style={type.sectionTitle}>{t("trainingAnalytics.weekly")}</Text>
            {weekly.map((row) => <View key={row.week} style={{ gap: space(6) }}><View style={styles.spread}><Text style={type.meta}>{t("trainingAnalytics.weekOf", { date: date(row.week) })}</Text><Text style={type.body}>{row.volume === null ? "—" : `${num(row.volume)} ${t("trainingAnalytics.kgReps")}`}</Text></View><View style={{ height: 6, borderRadius: radius(3), backgroundColor: colors.sheetRaised, overflow: "hidden" }}><View style={{ height: 6, width: `${100 * (row.volume ?? 0) / maxWeekly}%`, backgroundColor: colors.accent, borderRadius: radius(3) }} /></View></View>)}
          </View>
        </>}
        <Records exercise={exercise} />
        <Text style={type.sectionTitle}>{t("trainingAnalytics.sessionHistory")}</Text>
        {[...points].reverse().slice(0, limit).map((point) => <Pressable key={point.sessionId} accessibilityRole="button" accessibilityLabel={t("trainingAnalytics.viewSession", { name: point.sessionName || t("training.title"), date: point.date })} onPress={() => router.push(`/health/training/session/${point.sessionId}`)} style={styles.card}>
          <Text style={type.sectionTitle}>{date(point.date)} · {point.sessionName || t("training.title")}</Text><Text style={type.meta}>{t("trainingAnalytics.sessionStats", { sets: point.sets, repetitions: point.repetitions })}</Text>
          <Text style={type.body}>{t("trainingAnalytics.load")}: {point.load === null ? "—" : `${num(point.load)} kg`} · {t("trainingAnalytics.reps")}: {point.reps}</Text>
          <Text style={type.body}>{t("trainingAnalytics.volume")}: {point.volume === null ? "—" : `${num(point.volume)} ${t("trainingAnalytics.kgReps")}`}</Text><Text style={type.meta}>{t("trainingAnalytics.estimated")}: {point.estimated === null ? "—" : `${num(point.estimated)} kg`}</Text>
          {point === exercise.points[0] ? <Text style={type.meta}>{t("trainingAnalytics.first")}</Text> : null}
          {point.marks.length ? <Text style={[type.meta, { color: colors.ok }]}>{t("trainingAnalytics.improved", { marks: point.marks.map((kind) => t(`trainingAnalytics.${kind}`)).join(", ") })}</Text> : null}
        </Pressable>)}
        {points.length > limit ? <Button title={t("trainingAnalytics.more")} onPress={() => setLimit((old) => old + 20)} /> : null}
      </>}
    </> : null}

  </Screen>
    {exercises.length ? <AnalyticsExercisePicker key={picker ? "open" : "closed"} open={picker} selected={exercise?.key ?? selected} exercises={exercises} onClose={() => setPicker(false)} onSelect={(key) => { setSelected(key); const chosen = exercises.find((row) => row.key === key); if (chosen) router.setParams({ exercise: chosen.name }); }} /> : null}
  </>;
}
