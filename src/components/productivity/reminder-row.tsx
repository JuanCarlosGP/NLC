import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Bell, BellOff } from "lucide-react-native";
import { formatReminderWhen, type ProdReminder } from "@/lib/reminders/types";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, layout } from "@/lib/theme";

const RIPPLE = { color: "rgba(240, 235, 227, 0.12)" };

export function ReminderRow({
  reminder,
  onPress,
  onToggle,
}: {
  reminder: ProdReminder;
  onPress: () => void;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={RIPPLE}
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
          {reminder.enabled ? "" : " · pausado"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={reminder.enabled ? "Pausar recordatorio" : "Activar recordatorio"}
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

export const reminderListStyle = {
  marginHorizontal: -layout.screenPad,
};

const styles = StyleSheet.create({
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
});
