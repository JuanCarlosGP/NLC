import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { useAppearance } from "@/lib/appearance/shared";
import { createStyles } from "@/lib/appearance/density";
import { useThemeId } from "@/lib/appearance/use-theme-id";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, type } from "@/lib/theme";

export function AppearanceToggle() {
  useThemeId();
  const { theme, ready, error, setTheme } = useAppearance();
  const { t } = useI18n();
  return <View style={styles.group}>
    <View accessibilityRole="radiogroup" accessibilityLabel={t("appearance.title")} style={styles.row}>
      {(["classic", "geist-pixel"] as const).map(id => {
        const selected = theme === id;
        return <Pressable key={id} accessibilityRole="radio"
          accessibilityLabel={t(id === "classic" ? "appearance.classic" : "appearance.pixel")}
          accessibilityState={{ checked: selected, disabled: !ready }} disabled={!ready}
          android_ripple={{ color: colors.ripple }}
          onPress={() => { if (!selected) { triggerUiHaptic(); void setTheme(id); } }}
          style={({ pressed }) => [styles.option, selected && styles.selected, { opacity: pressed ? 0.88 : 1 }]}>
          <Text style={[type.body, selected ? styles.selectedText : styles.text]}>
            {t(id === "classic" ? "appearance.classic" : "appearance.pixel")}
          </Text>
        </Pressable>;
      })}
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{t("appearance.storageError")}</Text> : null}
  </View>;
}
const styles = createStyles(() => ({
  group: { gap: 6 },
  row: { flexDirection: "row", gap: 8 },
  option: { flex: 1, minHeight: 48, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.rule, borderRadius: 12,
    backgroundColor: colors.sheet, alignItems: "center", justifyContent: "center" },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  text: { color: colors.ink }, selectedText: { color: colors.void },
  error: { ...type.meta, color: colors.danger },
}));
