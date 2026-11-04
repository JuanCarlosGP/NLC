import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles } from "@/lib/appearance/density";
import { Platform, Pressable, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { Bell, BellOff } from "lucide-react-native";
import { useI18n } from "@/lib/i18n/context";
import { formatReminderWhen, type ProdReminder } from "@/lib/reminders/types";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, layout } from "@/lib/theme";


export function ReminderRow({
  reminder,
  onPress,
  onToggle,
}: {
  reminder: ProdReminder;
  onPress: () => void;
  onToggle: () => void;
}) {
  useThemeId();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: colors.ripple }}
      onPress={() => {
        triggerSelectionUiHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        Platform.OS !== "android" && pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.icon, !reminder.enabled && styles.iconOff]}>
        {reminder.enabled ? (
          <Bell color={colors.accent} size={16} strokeWidth={1.85} />
        ) : (
          <BellOff color={colors.muted} size={16} strokeWidth={1.85} />
        )}
      </View>
      <View style={styles.meta}>
        <Text style={[styles.title, !reminder.enabled && styles.titleOff]} numberOfLines={2}>
          {reminder.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {formatReminderWhen(reminder)}
          {reminder.enabled ? "" : ` · ${t("reminders.paused")}`}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={reminder.enabled ? t("reminders.pause") : t("reminders.resume")}
        hitSlop={10}
        onPress={() => {
          triggerSelectionUiHaptic();
          onToggle();
        }}
        style={[styles.toggle, reminder.enabled ? styles.toggleOn : styles.toggleOff]}
      >
        <View style={[styles.knob, reminder.enabled ? styles.knobOn : styles.knobOff]} />
      </Pressable>
    </Pressable>
  );
}

const reminderListStyleSheet = createStyles(() => ({ item: {
  marginHorizontal: -layout.screenPad,
} }));
export function reminderListStyle() { return reminderListStyleSheet.item; }

const styles = createStyles(() => ({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: layout.screenPad,
    overflow: "hidden",
  },
  pressed: { opacity: 0.82 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3A3229",
  },
  iconOff: {
    backgroundColor: colors.sheetRaised,
  },
  meta: { flex: 1, gap: 2 },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  titleOff: {
    color: colors.inkSoft,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 999,
    padding: 3,
    justifyContent: "center",
  },
  toggleOn: {
    backgroundColor: colors.accent,
  },
  toggleOff: {
    backgroundColor: colors.ruleLight,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 999,
  },
  knobOn: {
    alignSelf: "flex-end",
    backgroundColor: colors.accentText,
  },
  knobOff: {
    alignSelf: "flex-start",
    backgroundColor: colors.inkSoft,
  },
}));
