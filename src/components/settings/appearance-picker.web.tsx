import { space, textSize } from "@/lib/appearance/density";
import { Text, View } from "react-native";
import { useI18n } from "@/lib/i18n/context";
import { useAppearance } from "@/lib/appearance/shared";
import { parseAppearance } from "@/lib/appearance/themes";
import { colors, fonts, type } from "@/lib/theme";

export function AppearancePicker() {
  const { t } = useI18n();
  const { theme, ready, error, setTheme } = useAppearance();

  return <>
    <View style={{ height: 1, backgroundColor: colors.rule, marginLeft: space(16) }} />
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space(12), padding: "14px 16px" }}>
      <span style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: textSize(16) }}>
        {t("appearance.title")}
      </span>
      <select
        className="nlc-appearance-select"
        aria-label={t("appearance.title")}
        value={theme}
        disabled={!ready}
        onChange={(event) => { void setTheme(parseAppearance(event.currentTarget.value)); }}
        style={{ maxWidth: "60%", minWidth: 0, padding: "6px 0", border: 0, borderRadius: 0, background: colors.sheet, color: colors.muted, fontFamily: fonts.sans, fontSize: textSize(13), cursor: "pointer" }}
      >
        <option value="classic">{t("appearance.classic")}</option>
        <option value="geist-pixel">{t("appearance.pixel")}</option>
      </select>
    </label>
    {error ? <Text accessibilityRole="alert" style={[type.meta, { color: colors.danger, paddingHorizontal: space(16), paddingBottom: space(14) }]}>{t("appearance.saveError")}</Text> : null}
  </>;
}
