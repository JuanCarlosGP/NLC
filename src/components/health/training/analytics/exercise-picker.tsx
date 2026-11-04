import { space } from "@/lib/appearance/density";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import type { ExerciseAnalytics } from "@/lib/health/training/analytics";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button, Field, styles } from "../ui";
export function AnalyticsExercisePicker({ open, selected, exercises, onClose, onSelect }: { open: boolean; selected: string; exercises: ExerciseAnalytics[]; onClose(): void; onSelect(key: string): void }) {
  const { t, locale } = useI18n(); const [query, setQuery] = useState(""); const [limit, setLimit] = useState(40);
  const filtered = exercises.filter((exercise) => exercise.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  return <BottomSheet open={open} onOpenChange={(value) => { if (!value) onClose(); }} accessibilityCloseLabel={t("trainingAnalytics.close")} viewportRatio={0.75}>
    <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(12) }}><Text style={type.pageTitle}>{t("trainingAnalytics.choose")}</Text>
      <Field label={t("trainingAnalytics.search")} value={query} onChangeText={(value) => { setQuery(value); setLimit(40); }} />
      {filtered.slice(0, limit).map((exercise) => <Pressable accessibilityRole="button" accessibilityState={{ selected: exercise.key === selected }} key={exercise.key} onPress={() => { onSelect(exercise.key); onClose(); }} style={[styles.card, { borderColor: exercise.key === selected ? colors.accent : colors.rule }]}>
        <Text style={type.sectionTitle}>{exercise.name}</Text><Text style={type.meta}>{exercise.points.length} {t("trainingAnalytics.sessions").toLocaleLowerCase(locale)} · {exercise.sets} {t("trainingAnalytics.sets").toLocaleLowerCase(locale)}{exercise.key === selected ? ` · ${t("trainingAnalytics.selected")}` : ""}</Text>
      </Pressable>)}
      {!filtered.length ? <Text style={type.body}>{t("trainingAnalytics.noResults")}</Text> : null}
      {filtered.length > limit ? <Button title={t("trainingAnalytics.more")} onPress={() => setLimit((old) => old + 40)} /> : null}
      <Button title={t("common.cancel")} onPress={onClose} />
    </SheetScrollView>
  </BottomSheet>;
}
