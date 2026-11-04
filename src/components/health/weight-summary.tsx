import { createStyles, densityData } from "@/lib/appearance/density";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { weightSummary, type WeightEntry } from "@/lib/health/weight/model";
import { useWeight } from "@/lib/health/weight/weight-context";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts, type } from "@/lib/theme";
import { weightDate, weightNumber } from "./weight-format";

export function AddWeightButton({ onPress, disabled = false }: { onPress(): void; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.add, { opacity: disabled ? 0.4 : pressed ? 0.86 : 1 }]}>
      <Plus size={19} color={colors.accentText} strokeWidth={1.9} />
      <Text style={styles.addLabel}>{t("health.addWeight")}</Text>
    </Pressable>
  );
}

export function WeightLoadState() {
  const { ready, loadFailed, refresh } = useWeight();
  const { t } = useI18n();
  if (!ready) return <Text style={type.meta}>{t("common.loading")}</Text>;
  if (!loadFailed) return null;
  return (
    <View style={styles.error}>
      <Text accessibilityRole="alert" style={type.body}>{t("health.loadFailed")}</Text>
      <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}>
        <Text style={styles.link}>{t("common.retry")}</Text>
      </Pressable>
    </View>
  );
}

export function WeightSummary({ entries }: { entries: WeightEntry[] }) {
  const { t, locale } = useI18n();
  const { latest, average7d, changeKg, count } = weightSummary(entries);
  const stats = [
    { label: t("health.latest"), value: weightNumber(latest?.weightKg ?? null, locale), unit: "kg" },
    { label: t("health.average7d"), value: weightNumber(average7d, locale), unit: "kg" },
    { label: t("health.change"), value: `${changeKg != null && changeKg > 0 ? "+" : ""}${weightNumber(changeKg, locale)}`, unit: "kg" },
    { label: t("health.entries"), value: String(count), unit: "" },
  ];
  return (
    <View {...densityData("stats")} style={styles.stats}>
      {stats.map((stat) => (
        <View style={styles.stat} key={stat.label}>
          <Text style={type.meta}>{stat.label}</Text>
          <Text style={styles.value}>{stat.value}<Text style={styles.unit}> {stat.unit}</Text></Text>
        </View>
      ))}
    </View>
  );
}

export function WeightRow({ entry, onEdit, onDelete }: { entry: WeightEntry; onEdit(): void; onDelete?(): void }) {
  const { t, locale } = useI18n();
  const date = weightDate(entry.entryDate, locale);
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("health.editEntry", { date })} onPress={onEdit} style={styles.entry}>
        <View style={styles.dateNote}>
          <Text style={styles.date}>{date}</Text>
          {entry.note ? <Text numberOfLines={2} style={type.meta}>{entry.note}</Text> : null}
        </View>
        <Text style={styles.kg}>{weightNumber(entry.weightKg, locale)} <Text style={type.meta}>kg</Text></Text>
      </Pressable>
      {onDelete ? <Pressable accessibilityRole="button" accessibilityLabel={t("health.deleteEntry", { date })}
        onPress={onDelete} style={styles.remove}><Trash2 color={colors.muted} size={17} /></Pressable> : null}
    </View>
  );
}

export function WeightEmpty() {
  const { t } = useI18n();
  return <View style={styles.empty}><Text style={type.sectionTitle}>{t("health.emptyTitle")}</Text><Text style={type.body}>{t("health.emptyBody")}</Text></View>;
}

const styles = createStyles({
  add: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14 },
  addLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.accentText },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { flexGrow: 1, flexBasis: "45%", backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.rule, borderRadius: 12, padding: 16, gap: 8 },
  value: { fontFamily: fonts.serif, fontSize: 32, color: colors.ink }, unit: { ...type.meta, fontFamily: fonts.sans },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.rule },
  entry: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: 16, gap: 12 },
  dateNote: { flex: 1, gap: 4 }, date: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  kg: { fontFamily: fonts.sansMedium, fontSize: 17, color: colors.ink }, remove: { padding: 14 },
  empty: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheet, borderRadius: 14, padding: 22, gap: 8 },
  error: { gap: 8 }, retry: { alignSelf: "flex-start", paddingVertical: 8 }, link: { ...type.body, color: colors.accent },
});
