import { IntegrationCard } from "@/components/integrations/shared";
import { createStyles, densityData } from "@/lib/appearance/density";
import { HealthBackupHomeCard } from "./backup/backup-screen";
import { NutritionHomeCard } from "./nutrition/nutrition-screen";
import { BodyPhotosHomeCard } from "./body-photos/body-screen";
import { MedicationHomeCard } from "./medication/medication-screen";
import { TrainingHomeCard } from "./training/training-home";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowUpRight, Scale } from "lucide-react-native";
import { LadybugMark } from "@/components/brand/ladybug-mark";
import { ZoneSwitch } from "@/components/layout/zone-switch";
import { Screen } from "@/components/ui/screen";
import { useWeight } from "@/lib/health/weight/weight-context";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { WeightComposerSheet } from "./weight-composer-sheet";
import { AddWeightButton, WeightEmpty, WeightLoadState, WeightSummary } from "./weight-summary";

export function HealthHome() {
  const router = useRouter();
  const { t } = useI18n();
  const { entries, ready, loadFailed } = useWeight();
  const [composerOpen, setComposerOpen] = useState(false);
  return (
    <>
      <Screen>
        <View style={styles.hero}><LadybugMark /><ZoneSwitch /></View>
        <View style={styles.heading}>
          <Text style={type.pageTitle}>{t("health.overview")}</Text>

        </View>
        <View {...densityData("health-actions")} style={styles.actions}>
        <IntegrationCard provider="whoop" />
        <TrainingHomeCard />
        <MedicationHomeCard />
        <BodyPhotosHomeCard />
        <NutritionHomeCard />
        <HealthBackupHomeCard />
        </View>
        <WeightLoadState />
        {ready && !loadFailed ? <>
          <WeightSummary entries={entries} />
          {!entries.length ? <WeightEmpty /> : null}
          <AddWeightButton onPress={() => setComposerOpen(true)} />
          <Pressable accessibilityRole="button" onPress={() => router.push("/health/weight")}
            style={({ pressed }) => [styles.history, { opacity: pressed ? 0.8 : 1 }]}>
            <Scale size={23} color={colors.accent} strokeWidth={1.6} />
            <View style={styles.historyText}><Text style={type.sectionTitle}>{t("health.weight")}</Text><Text style={type.meta}>{t("health.history")}</Text></View>
            <ArrowUpRight size={20} color={colors.inkSoft} />
          </Pressable>
        </> : null}

      </Screen>
      <WeightComposerSheet open={composerOpen} onOpenChange={setComposerOpen} />
    </>
  );
}

const styles = createStyles({
  actions: { gap: 18 },
  hero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 8, paddingBottom: 4, flexWrap: "wrap" },
  heading: { gap: 8 }, history: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: colors.rule,
    backgroundColor: colors.sheet, borderRadius: 14, padding: 18 }, historyText: { flex: 1, gap: 5 },
});
