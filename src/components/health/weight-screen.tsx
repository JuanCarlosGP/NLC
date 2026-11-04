import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles } from "@/lib/appearance/density";
import { InlineHelp } from "@/components/ui/inline-help";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/components/ui/themed-text";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { shiftDateKey, weightMonths, type WeightEntry } from "@/lib/health/weight/model";
import { useWeight } from "@/lib/health/weight/weight-context";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts, type } from "@/lib/theme";
import { WeightChart } from "./weight-chart";
import { WeightComposerSheet } from "./weight-composer-sheet";
import { weightDate, weightNumber } from "./weight-format";
import { AddWeightButton, WeightEmpty, WeightLoadState, WeightRow, WeightSummary } from "./weight-summary";

export function WeightScreen({ searchOnly = false }: { searchOnly?: boolean }) {
  useThemeId();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { entries, ready, loadFailed, remove } = useWeight();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const [deleting, setDeleting] = useState<WeightEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<30 | 90 | null>(90);
  const [limit, setLimit] = useState(30);
  const filtered = useMemo(() => {
    const needle = query.toLocaleLowerCase(locale).trim().replace(",", ".");
    return entries.filter((entry) => `${entry.entryDate} ${weightDate(entry.entryDate, locale)} ${entry.weightKg} ${entry.note}`.toLocaleLowerCase(locale).includes(needle));
  }, [entries, locale, query]);
  const chartFrom = range && entries[0] ? shiftDateKey(entries[0].entryDate, -(range - 1)) : undefined;
  const months = useMemo(() => weightMonths(entries), [entries]);

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try { await remove(deleting.entryDate); setDeleting(null); }
    catch { setDeleteFailed(true); }
    finally { setDeleteBusy(false); }
  }
  function edit(entry: WeightEntry | null) { setEditing(entry); setComposerOpen(true); }

  return (
    <>
      <Screen>
        <View style={styles.heading}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("chrome.home")} onPress={() => router.push("/")} style={styles.back}>
            <ArrowLeft color={colors.ink} size={22} />
          </Pressable>
          <View style={styles.title}><Text style={type.pageTitle}>{t(searchOnly ? "health.searchTitle" : "health.weight")}</Text></View>
        </View>
        <WeightLoadState />
        {ready && !loadFailed ? <>
          {!searchOnly ? <>
            <WeightSummary entries={entries} />
            <AddWeightButton onPress={() => edit(null)} />
            {entries.length ? <View style={styles.section}>
              <Text style={type.sectionTitle}>{t("health.trend")}</Text>
              <View style={styles.chips}>
                {([30, 90, null] as const).map((value) => <Pressable key={String(value)} accessibilityRole="button"
                  accessibilityState={{ selected: range === value }} onPress={() => setRange(value)}
                  style={[styles.chip, range === value && styles.chipOn]}>
                  <Text style={[styles.chipLabel, range === value && styles.chipLabelOn]}>{t(value === 30 ? "health.month30" : value === 90 ? "health.month90" : "health.all")}</Text>
                </Pressable>)}
              </View>
              <WeightChart entries={entries} fromDate={chartFrom} />
              <InlineHelp label={t("health.about")}><Text style={type.meta}>{t("health.averageHint")}</Text><Text style={type.meta}>{t("health.rangeHint")}</Text></InlineHelp>
            </View> : null}
          </> : null}
          {(entries.length > 0 || searchOnly) ? <View style={styles.section}>
            <Text style={type.sectionTitle}>{t("health.history")}</Text>
            <TextInput accessibilityLabel={t("health.searchHint")} value={query}
              onChangeText={(next) => { setQuery(next); setLimit(30); }} placeholder={t("health.searchHint")}
              placeholderTextColor={colors.muted} autoCorrect={false} style={styles.input} />
            {filtered.slice(0, limit).map((entry) => <WeightRow key={entry.entryDate} entry={entry} onEdit={() => edit(entry)}
              onDelete={() => { setDeleteFailed(false); setDeleting(entry); }} />)}
            {!filtered.length ? <Text style={type.body}>{t("health.noResults")}</Text> : null}
            {filtered.length > limit ? <Pressable accessibilityRole="button" onPress={() => setLimit((value) => value + 30)} style={styles.more}>
              <Text style={styles.link}>{t("health.more")}</Text></Pressable> : null}
          </View> : <WeightEmpty />}
          {!searchOnly && months.length ? <View style={styles.section}>
            <Text style={type.sectionTitle}>{t("health.monthly")}</Text>
            {months.map((month) => <View key={month.month} style={styles.month}>
              <View style={styles.title}><Text style={styles.monthTitle}>{new Date(`${month.month}-01T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}</Text>
                <Text style={type.meta}>{t(month.count === 1 ? "health.countOne" : "health.countMany", { count: month.count })} · {t("health.minMax", { min: weightNumber(month.min, locale), max: weightNumber(month.max, locale) })}</Text></View>
              <View style={styles.monthValue}><Text style={type.meta}>{t("health.mean")}</Text><Text style={styles.monthTitle}>{weightNumber(month.average, locale)} kg</Text></View>
            </View>)}
          </View> : null}
        </> : null}

      </Screen>
      <WeightComposerSheet open={composerOpen} entry={editing} onOpenChange={setComposerOpen} />
      <ConfirmDialog open={deleting !== null} title={t("health.deleteTitle")} busy={deleteBusy}
        message={`${t("health.deleteBody", { date: deleting ? weightDate(deleting.entryDate, locale) : "" })}${deleteFailed ? `\n\n${t("health.deleteFailed")}` : ""}`}
        onConfirm={() => void confirmDelete()} onCancel={() => { if (!deleteBusy) setDeleting(null); }} />
    </>
  );
}

const styles = createStyles(() => ({
  heading: { flexDirection: "row", alignItems: "center", gap: 12 }, title: { flex: 1, gap: 5 }, back: { paddingVertical: 12, paddingRight: 8 },
  section: { gap: 10 }, input: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheet, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheet },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink }, chipLabel: { ...type.meta, fontFamily: fonts.sansMedium }, chipLabelOn: { color: colors.void },
  more: { padding: 12, alignItems: "center" }, link: { ...type.body, color: colors.accent },
  month: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.rule },
  monthTitle: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink }, monthValue: { alignItems: "flex-end", gap: 5 },
}));
