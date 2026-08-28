import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Bell, Plus } from "lucide-react-native";
import { ReminderComposerSheet } from "@/components/productivity/reminder-composer-sheet";
import { ReminderRow, reminderListStyle } from "@/components/productivity/reminder-row";
import { Screen } from "@/components/ui/screen";
import { useI18n } from "@/lib/i18n/context";
import { useReminders } from "@/lib/reminders/reminders-context";
import type { ProdReminder } from "@/lib/reminders/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, type } from "@/lib/theme";

export default function RemindersScreen() {
  const { t } = useI18n();
  const { reminders, updateReminder } = useReminders();
  const [composeOpen, setComposeOpen] = useState(false);
  const [editing, setEditing] = useState<ProdReminder | null>(null);

  const count = reminders.length
    ? t(reminders.length === 1 ? "reminders.alertOne" : "reminders.alertMany", { count: reminders.length })
    : t("reminders.none");

  const sorted = useMemo(
    () =>
      [...reminders].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.hour * 60 + a.minute - (b.hour * 60 + b.minute);
      }),
    [reminders],
  );

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <View style={styles.art}>
            <Bell color={colors.accent} size={36} strokeWidth={1.8} />
          </View>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <Text style={type.label}>{t("focus.productivity")}</Text>
              <Text style={type.pageTitle}>{t("focus.reminders")}</Text>
              <Text style={type.meta}>{count}</Text>
            </View>
            <Pressable
              accessibilityLabel={t("focus.newReminder")}
              onPress={() => {
                triggerUiHaptic();
                setEditing(null);
                setComposeOpen(true);
              }}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Plus size={24} color={colors.ink} strokeWidth={1.8} />
            </Pressable>
          </View>
        </View>
        {Platform.OS === "web" ? (
          <Text style={type.body}>{t("focus.reminderHint")}</Text>
        ) : null}
        {sorted.length ? (
          <View style={reminderListStyle}>
            {sorted.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                onPress={() => {
                  setEditing(reminder);
                  setComposeOpen(true);
                }}
                onToggle={() => {
                  void updateReminder(reminder.id, { enabled: !reminder.enabled });
                }}
              />
            ))}
          </View>
        ) : (
          <Text style={type.body}>{t("reminders.emptyHint")}</Text>
        )}
      </Screen>
      <ReminderComposerSheet
        open={composeOpen}
        onOpenChange={(open) => {
          setComposeOpen(open);
          if (!open) setEditing(null);
        }}
        reminder={editing}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingTop: 8 },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headingText: { flex: 1, gap: 6 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  art: {
    width: 96,
    height: 96,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3A3229",
    marginBottom: 8,
  },
});
