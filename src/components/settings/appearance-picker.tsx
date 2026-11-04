import { useThemeId } from "@/lib/appearance/use-theme-id";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { Check, ChevronRight } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { createStyles } from "@/lib/appearance/density";
import { useAppearance } from "@/lib/appearance/shared";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
export function AppearancePicker() {
    useThemeId();
    const { t } = useI18n();
    const { theme, ready, error, setTheme } = useAppearance();
    const [open, setOpen] = useState(false);
    return <>
    <View style={styles.divider}/>
    <Pressable accessibilityRole="button" accessibilityLabel={t("appearance.title")} accessibilityState={{ expanded: open, disabled: !ready }} disabled={!ready} onPress={() => setOpen(true)} style={styles.row}>
      <Text style={styles.label}>{t("appearance.title")}</Text><Text style={type.meta}>{t(theme === "geist-pixel" ? "appearance.pixel" : "appearance.classic")}</Text><ChevronRight size={16} color={colors.muted}/>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{t("appearance.storageError")}</Text> : null}
    <BottomSheet open={open} onOpenChange={setOpen} viewportRatio={0.32}>
      <SheetScrollView contentContainerStyle={styles.options}>
        <Text style={type.sectionTitle}>{t("appearance.title")}</Text>
        {(["geist-pixel", "classic"] as const).map(id => <Pressable key={id} accessibilityRole="radio" accessibilityLabel={t(id === "geist-pixel" ? "appearance.pixel" : "appearance.classic")} accessibilityState={{ checked: theme === id }} onPress={() => { void setTheme(id); setOpen(false); }} style={styles.option}>
          <Text style={styles.label}>{t(id === "geist-pixel" ? "appearance.pixel" : "appearance.classic")}</Text>{theme === id ? <Check size={19} color={colors.accent}/> : null}
        </Pressable>)}
      </SheetScrollView>
    </BottomSheet>
  </>;
}
const styles = createStyles(() => ({
    divider: { height: 1, backgroundColor: colors.rule, marginLeft: 16 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14, minHeight: 48 },
    label: { ...type.body, color: colors.ink, flex: 1 },
    options: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
    option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, minHeight: 48, borderBottomWidth: 1, borderColor: colors.rule },
    error: { ...type.meta, color: colors.danger, paddingHorizontal: 16, paddingBottom: 12 },
}));
