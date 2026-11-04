import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles, space } from "@/lib/appearance/density";
import type { ReactNode } from "react";
import { Pressable, View, type TextInputProps } from "react-native";
import { Text, TextInput } from "@/components/ui/themed-text";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { colors, fonts, type } from "@/lib/theme";
import { useI18n } from "@/lib/i18n/context";
import { useTraining } from "@/lib/health/training/training-context";
import { sessionSummary, TrainingValidationError, type TrainingSession } from "@/lib/health/training/model";

export const styles = createStyles(() => ({
  section: { gap: 12 }, row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  spread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  card: { padding: 16, gap: 12, backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.rule, borderRadius: 14 },
  input: { borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.sheetRaised, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, color: colors.ink, fontFamily: fonts.sans, fontSize: 16 },
  button: { paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, borderRadius: 10, backgroundColor: colors.sheetRaised, borderWidth: 1, borderColor: colors.rule, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
  error: { ...type.body, color: colors.danger }, link: { ...type.body, color: colors.accent },
}));
export function Button({ title, onPress, primary = false, disabled = false, danger = false }: { title: string; onPress(): void; primary?: boolean; disabled?: boolean; danger?: boolean }) {
  useThemeId();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, primary && styles.primary, { opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }]}>
    <Text style={[styles.buttonText, primary && { color: colors.accentText }, danger && { color: colors.danger }]}>{title}</Text></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  useThemeId();
  return <View style={{ gap: space(6) }}><Text style={type.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={[styles.input, props.style]} /></View>;
}
export function Header({ title, children, home = false }: { title: string; children?: ReactNode; home?: boolean }) {
  useThemeId();
  const router = useRouter(); const { t } = useI18n();
  return <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={t(home ? "chrome.home" : "training.back")} onPress={() => router.push(home ? "/" : "/health/training")} style={{ minWidth: 44, minHeight: 44, justifyContent: "center", paddingVertical: space(12), paddingRight: space(6) }}><ArrowLeft size={22} color={colors.ink} /></Pressable>
    <View style={{ flex: 1, gap: space(4) }}><Text style={type.pageTitle}>{title}</Text></View>{children}</View>;
}
export function TrainingLoadState() {
  useThemeId();
  const { ready, loadFailed, refresh } = useTraining(); const { t } = useI18n();
  if (!ready) return <Text style={type.meta}>{t("common.loading")}</Text>;
  return loadFailed ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{t("training.loadError")}</Text><Button title={t("training.retry")} onPress={() => void refresh()} /></View> : null;
}
export function SaveState() {
  useThemeId();
  const { status, flush } = useTraining(); const { t } = useI18n();
  return <View style={{ gap: space(6) }}><Text accessibilityRole={status === "error" ? "alert" : undefined} style={status === "error" ? styles.error : type.meta}>{t(status === "error" ? "training.saveError" : status === "saving" ? "training.saving" : "training.saved")}</Text>
    {status === "error" ? <Button title={t("training.retry")} onPress={() => void flush().catch(() => {})} /> : null}</View>;
}
export function SessionRow({ session }: { session: TrainingSession }) {
  useThemeId();
  const router = useRouter(); const { t, locale } = useI18n(); const stats = sessionSummary(session);
  return <Pressable accessibilityRole="button" onPress={() => router.push(`/health/training/session/${session.id}`)} style={styles.card}>
    <View style={styles.spread}><Text style={[type.sectionTitle, { flex: 1 }]}>{session.name || t("training.new")}</Text><Text style={[type.meta, { color: session.finishedAt ? colors.muted : colors.accent }]}>{t(session.finishedAt ? "training.finished" : "training.active")}</Text></View>
    <Text style={type.meta}>{new Date(`${session.date}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</Text>
    <Text style={type.body}>{t("training.summary", stats)}</Text></Pressable>;
}
export function errorKey(error: unknown): string { return error instanceof TrainingValidationError ? `training.errors.${error.code}` : "training.errors.storage"; }
