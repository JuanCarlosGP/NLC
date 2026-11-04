import { space } from "@/lib/appearance/density";
import { Pressable, Text, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { MedicationValidationError } from "@/lib/health/medication/model";
import { useMedication } from "@/lib/health/medication/medication-context";
import { Button, styles } from "../training/ui";
export { Button, Field, styles } from "../training/ui";
export function MedicationHeader() {
  const router = useRouter(); const { t } = useI18n();
  return <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={t("medication.back")} onPress={() => router.push("/")} style={{ paddingVertical: space(12), paddingRight: space(6) }}><ArrowLeft size={22} color={colors.ink} /></Pressable>
    <View style={{ flex: 1, gap: space(4) }}><Text style={type.pageTitle}>{t("medication.title")}</Text></View></View>;
}
export function MedicationLoadState() {
  const { ready, loadFailed, refresh } = useMedication(); const { t } = useI18n();
  if (!ready) return <Text style={type.meta}>{t("common.loading")}</Text>;
  return loadFailed ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{t("medication.loadError")}</Text><Button title={t("common.retry")} onPress={() => void refresh()} /></View> : null;
}
export function medicationErrorKey(error: unknown): string { return error instanceof MedicationValidationError ? `medication.errors.${error.code}` : "medication.storageError"; }
