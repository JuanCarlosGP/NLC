import { useThemeId } from "@/lib/appearance/use-theme-id";
import { space } from "@/lib/appearance/density";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text, TextInput } from "@/components/ui/themed-text";
import { useRouter } from "expo-router";
import { Dumbbell, ArrowUpRight } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { useTraining } from "@/lib/health/training/training-context";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button, Header, SessionRow, TrainingLoadState, styles } from "./ui";
import { SessionComposer } from "./session-composer";
import { RestCard } from "./rest-card";

export function TrainingHomeCard() {
  useThemeId();
  const router = useRouter(); const { t } = useI18n(); const { sessions } = useTraining();
  const open = sessions.filter((session) => session.finishedAt === null).length;
  return <Pressable accessibilityRole="button" onPress={() => router.push("/health/training")} style={[styles.card, styles.spread]}>
    <Dumbbell size={24} color={colors.accent} strokeWidth={1.6} /><View style={{ flex: 1, gap: space(5) }}><Text style={type.sectionTitle}>{t("training.title")}</Text>
      <Text style={type.meta}>{sessions.length} {t("training.sessions").toLocaleLowerCase()}{open ? ` · ${open} ${t("training.active").toLocaleLowerCase()}` : ""}</Text></View><ArrowUpRight size={20} color={colors.inkSoft} /></Pressable>;
}
export function TrainingHome() {
  useThemeId();
  const router = useRouter(); const { t, locale } = useI18n(); const { sessions, ready, loadFailed } = useTraining();
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(""); const [limit, setLimit] = useState(20);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return sessions.filter((session) => `${session.date} ${session.name} ${session.note} ${session.exercises.map((exercise) => exercise.name).join(" ")}`.toLocaleLowerCase(locale).includes(needle));
  }, [sessions, query, locale]);
  return <><Screen>
    <Header title={t("training.title")} home />

    <TrainingLoadState />
    {ready && !loadFailed ? <>
      <View style={styles.row}><Button primary title={t("training.new")} onPress={() => setOpen(true)} /><Button title={t("training.calendar")} onPress={() => router.push("/health/training/calendar")} /></View>
      <Button title={t("trainingAnalytics.open")} onPress={() => router.push("/health/training/analytics")} />
      <RestCard />
      <TextInput accessibilityLabel={t("training.search")} placeholder={t("training.search")} placeholderTextColor={colors.muted} value={query} onChangeText={(text) => { setQuery(text); setLimit(20); }} style={styles.input} />
      {!sessions.length ? <View style={styles.card}><Text style={type.sectionTitle}>{t("training.empty")}</Text><Text style={type.body}>{t("training.emptyBody")}</Text></View> : null}
      {filtered.slice(0, limit).map((session) => <SessionRow key={session.id} session={session} />)}
      {!filtered.length && sessions.length ? <Text style={type.body}>{t("training.noResults")}</Text> : null}
      {filtered.length > limit ? <Button title={t("health.more")} onPress={() => setLimit((value) => value + 20)} /> : null}
    </> : null}

  </Screen><SessionComposer open={open} onClose={() => setOpen(false)} /></>;
}
