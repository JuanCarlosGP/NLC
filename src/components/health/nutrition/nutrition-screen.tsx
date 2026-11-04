import { useThemeId } from "@/lib/appearance/use-theme-id";
import { space, radius } from "@/lib/appearance/density";
import { useEffect, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { useRouter } from "expo-router";
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Utensils } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useNutrition } from "@/lib/health/nutrition/nutrition-context";
import { nutritionWeek } from "@/lib/health/nutrition/model";
import { localDateKey, shiftDateKey } from "@/lib/health/weight/model";
import { monthDays, shiftMonth } from "@/lib/health/training/model";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button, styles } from "../training/ui";
import { NutritionComposer, nutritionError } from "./composer";
import { NutritionImport } from "./import-sheet";

export function NutritionHomeCard() {
  useThemeId();
  const router = useRouter(); const { t } = useI18n(); const { entries } = useNutrition(); const day = entries.find((row) => row.date === localDateKey());
  return <Pressable accessibilityRole="button" onPress={() => router.push("/health/nutrition")} style={[styles.card, styles.row]}>
    <Utensils size={24} color={colors.accent} strokeWidth={1.6} /><View style={{ flex: 1, gap: space(5) }}><Text style={type.sectionTitle}>{t("nutrition.title")}</Text><Text style={type.meta}>{day ? `${day.calories} kcal · ${t("nutrition.today")}` : t("nutrition.homeHint")}</Text></View><ArrowUpRight size={20} color={colors.inkSoft} />
  </Pressable>;
}
export function NutritionScreen() {
  useThemeId();
  const router = useRouter(); const { t, locale } = useI18n(); const { entries, ready, loadFailed, refresh, remove } = useNutrition();
  const [today, setToday] = useState(localDateKey()); const [date, setDate] = useState(today); const [month, setMonth] = useState(today.slice(0, 7)); const [tab, setTab] = useState<"daily" | "history">("daily");
  const [composer, setComposer] = useState(false); const [importing, setImporting] = useState(false); const [deleting, setDeleting] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [foodLimit, setFoodLimit] = useState(20); const [historyLimit, setHistoryLimit] = useState(30);
  const day = entries.find((row) => row.date === date) ?? null; const week = nutritionWeek(entries, date);
  useEffect(() => { const update = () => setToday(localDateKey()); const timer = setInterval(update, 30000); const sub = AppState.addEventListener("change", update); return () => { clearInterval(timer); sub.remove(); }; }, []);
  useEffect(() => setFoodLimit(20), [date]);
  const formatDate = (value: string, options?: Intl.DateTimeFormatOptions) => new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", ...options, timeZone: "UTC" });
  const num = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });
  function select(value: string) { setDate(value); setMonth(value.slice(0, 7)); setMessage(""); setError(""); }
  return <>
    <Screen keyboardShouldPersistTaps="handled">
      <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={t("chrome.home")} onPress={() => router.push("/")} style={{ padding: space(10) }}><ArrowLeft color={colors.ink} size={22} /></Pressable><View style={{ flex: 1 }}><Text style={type.pageTitle}>{t("nutrition.title")}</Text></View></View>

      {!ready ? <Text style={type.meta}>{t("common.loading")}</Text> : loadFailed ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{t("nutrition.loadError")}</Text><Button title={t("nutrition.retry")} onPress={() => void refresh()} /></View> : <>
        <View style={styles.row}>{(["daily", "history"] as const).map((value) => <Button key={value} primary={tab === value} title={t(`nutrition.${value}`)} onPress={() => setTab(value)} />)}</View>
        <Button title={t("nutrition.import")} onPress={() => { setImporting(true); setMessage(""); }} />
        {message ? <Text accessibilityLiveRegion="polite" style={[type.body, { color: colors.ok }]}>{message}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {tab === "history" ? <>
          <Text style={type.meta}>{t("nutrition.recorded", { count: entries.length })}</Text>
          {!entries.length ? <Text style={type.body}>{t("nutrition.noHistory")}</Text> : entries.slice(0, historyLimit).map((row) => <Pressable key={row.date} accessibilityRole="button" accessibilityLabel={t("nutrition.openDay", { date: row.date })} onPress={() => { select(row.date); setTab("daily"); }} style={styles.card}>
            <View style={styles.spread}><Text style={type.sectionTitle}>{formatDate(row.date)}</Text><Text style={type.body}>{num(row.calories)} kcal</Text></View><Text style={type.meta}>{t(`nutrition.${row.source}`)} · {t("nutrition.foodMacros", { protein: num(row.protein), carbs: num(row.carbs), fat: num(row.fat) })}</Text>
          </Pressable>)}
          {entries.length > historyLimit ? <Button title={t("nutrition.more")} onPress={() => setHistoryLimit((old) => old + 30)} /> : null}
        </> : <>
          <View style={styles.card}>
            <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={t("nutrition.previousMonth")} onPress={() => setMonth(shiftMonth(month, -1))} style={{ padding: space(10) }}><ChevronLeft color={colors.ink} size={20} /></Pressable><Text style={[type.sectionTitle, { flex: 1, textAlign: "center" }]}>{formatDate(`${month}-01`, { day: undefined })}</Text><Pressable accessibilityRole="button" accessibilityLabel={t("nutrition.nextMonth")} disabled={month >= today.slice(0, 7)} onPress={() => setMonth(shiftMonth(month, 1))} style={{ padding: space(10), opacity: month >= today.slice(0, 7) ? 0.3 : 1 }}><ChevronRight color={colors.ink} size={20} /></Pressable></View>
            <View style={{ flexDirection: "row" }}>{Array.from({ length: 7 }, (_, i) => <Text key={i} style={[type.meta, { width: "14.285714%", textAlign: "center" }]}>{formatDate(shiftDateKey("2026-11-02", i), { weekday: "narrow", day: undefined, month: undefined, year: undefined })}</Text>)}</View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{monthDays(month).map((key, index) => <View key={key ?? `blank-${index}`} style={{ width: "14.285714%", padding: space(2) }}>{key ? <Pressable accessibilityRole="button" accessibilityLabel={`${formatDate(key)}${entries.some((row) => row.date === key) ? ` · ${t("nutrition.registered")}` : ""}`} accessibilityState={{ selected: key === date, disabled: key > today }} disabled={key > today} onPress={() => select(key)} style={{ minHeight: 43, alignItems: "center", justifyContent: "center", borderRadius: radius(8), backgroundColor: key === date ? colors.accent : colors.sheetRaised, opacity: key > today ? 0.25 : 1 }}><Text style={[type.body, { color: key === date ? colors.accentText : colors.ink }]}>{Number(key.slice(-2))}</Text><View style={{ height: 4, width: 4, borderRadius: radius(2), backgroundColor: entries.some((row) => row.date === key) ? key === date ? colors.accentText : colors.ok : "transparent" }} /></Pressable> : null}</View>)}</View>
            <Text style={type.meta}>● {t("nutrition.registered")}</Text>
          </View>
          <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={t("nutrition.previous")} onPress={() => select(shiftDateKey(date, -1))} style={styles.button}><ChevronLeft color={colors.ink} size={20} /></Pressable><Text accessibilityRole="header" style={[type.sectionTitle, { flex: 1, textAlign: "center" }]}>{formatDate(date)}</Text><Pressable accessibilityRole="button" accessibilityLabel={t("nutrition.next")} disabled={date >= today} onPress={() => select(shiftDateKey(date, 1))} style={[styles.button, { opacity: date >= today ? 0.3 : 1 }]}><ChevronRight color={colors.ink} size={20} /></Pressable></View>
          {date !== today ? <Button title={t("nutrition.today")} onPress={() => select(today)} /> : null}
          <View style={styles.card}>
            {day ? <>
              <Text style={type.label}>{t(`nutrition.${day.source}`)}</Text><Text style={type.pageTitle}>{num(day.calories)} <Text style={type.sectionTitle}>kcal</Text></Text>
              <View style={[styles.row, { alignItems: "flex-start" }]}>{(["protein", "carbs", "fat"] as const).map((key) => <View key={key} style={{ flex: 1, minWidth: 80, gap: space(6) }}><Text style={type.meta}>{t(`nutrition.${key}`)}</Text><Text style={type.sectionTitle}>{num(day[key])} g</Text></View>)}</View>
              {day.note ? <Text style={type.body}>{day.note}</Text> : null}<Text style={type.meta}>{t("nutrition.saved")}</Text>
            </> : <><Text style={type.sectionTitle}>{t("nutrition.empty")}</Text><Text style={type.body}>{t("nutrition.emptyHint")}</Text></>}
            <Button primary title={t(day ? "nutrition.edit" : "nutrition.add")} onPress={() => setComposer(true)} />
          </View>
          <View style={styles.card}><Text style={type.sectionTitle}>{t("nutrition.week")}</Text><Text style={type.body}>{week.average === null ? t("nutrition.noWeek") : t("nutrition.weekAverage", { value: num(week.average), count: week.count })}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space(8), height: 90 }}>{Array.from({ length: 7 }, (_, i) => { const at = shiftDateKey(date, i - 6); const row = entries.find((entry) => entry.date === at); const max = Math.max(1, ...entries.filter((entry) => entry.date >= shiftDateKey(date, -6) && entry.date <= date).map((entry) => entry.calories)); return <Pressable key={at} accessibilityRole="button" accessibilityLabel={`${formatDate(at)} · ${row ? `${row.calories} kcal` : t("nutrition.empty")}`} onPress={() => select(at)} style={{ flex: 1, alignItems: "center", gap: space(5) }}><View style={{ width: "70%", height: row ? Math.max(3, 60 * row.calories / max) : 2, borderRadius: radius(3), backgroundColor: row ? colors.accent : colors.rule }} /><Text style={type.meta}>{Number(at.slice(-2))}</Text></Pressable>; })}</View><Text style={type.meta}>{t("nutrition.weekHint")}</Text>
          </View>
          {day?.source === "macrofactor" ? <View style={styles.card}><Text style={type.sectionTitle}>{day.foods.length ? t("nutrition.foods", { count: day.foods.length }) : t("nutrition.noFoods")}</Text>{day.foods.slice(0, foodLimit).map((food, i) => <View key={i} style={{ gap: space(4), borderTopWidth: 1, borderColor: colors.rule, paddingTop: space(10) }}><Text style={type.body}>{food.time ? `${food.time} · ` : ""}{food.name}</Text><Text style={type.meta}>{num(food.calories)} kcal · {t("nutrition.foodMacros", { protein: num(food.protein), carbs: num(food.carbs), fat: num(food.fat) })}</Text></View>)}{day.foods.length > foodLimit ? <Button title={t("nutrition.more")} onPress={() => setFoodLimit((old) => old + 20)} /> : null}</View> : null}
          {day ? <Button danger title={t("nutrition.remove")} onPress={() => setDeleting(true)} /> : null}
        </>}
      </>}

    </Screen>
    <NutritionComposer open={composer} entry={day} date={date} onClose={() => setComposer(false)} onSaved={(value) => { select(value); setMessage(t("nutrition.saved")); }} />
    <NutritionImport open={importing} onClose={() => setImporting(false)} onDone={(text, value) => { select(value); setTab("daily"); setMessage(text); }} />
    <ConfirmDialog open={deleting} title={t("nutrition.remove")} message={t("nutrition.removeMessage")} busy={busy} onCancel={() => setDeleting(false)} onConfirm={() => { if (busy) return; setBusy(true); void remove(date).then(() => { setDeleting(false); setMessage(""); }).catch((err) => { setDeleting(false); setError(nutritionError(err, t)); }).finally(() => setBusy(false)); }} />
  </>;
}
