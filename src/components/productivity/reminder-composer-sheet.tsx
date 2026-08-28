import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import { dueToday, dueTomorrow, startOfDay } from "@/lib/productivity/dates";
import { useReminders } from "@/lib/reminders/reminders-context";
import {
  FREQUENCIES,
  FREQUENCY_LABEL,
  WEEKDAYS,
  formatReminderTime,
  type ProdReminder,
  type ReminderFrequency,
} from "@/lib/reminders/types";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

const TIME_PRESETS = [
  [8, 0],
  [9, 0],
  [13, 0],
  [18, 0],
  [21, 0],
] as const;

export function ReminderComposerSheet({
  open,
  onOpenChange,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder?: ProdReminder | null;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("reminders.closeReminder")}
      viewportRatio={0.82}
    >
      <ReminderComposerBody open={open} reminder={reminder ?? null} onDone={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

function ReminderComposerBody({
  open,
  reminder,
  onDone,
}: {
  open: boolean;
  reminder: ProdReminder | null;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { createReminder, updateReminder, deleteReminder } = useReminders();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [frequency, setFrequency] = useState<ReminderFrequency>("daily");
  const [weekday, setWeekday] = useState(2);
  const [onceDay, setOnceDay] = useState<"today" | "tomorrow">("today");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(reminder?.title ?? "");
    setBody(reminder?.body ?? "");
    setHour(reminder?.hour ?? 9);
    setMinute(reminder?.minute ?? 0);
    setFrequency(reminder?.frequency ?? "daily");
    setWeekday(reminder?.weekday ?? 2);
    setOnceDay(reminder?.onceAt != null && reminder.onceAt >= dueTomorrow() ? "tomorrow" : "today");
    setBusy(false);
    setConfirmDelete(false);
  }, [open, reminder]);

  function stepTime(delta: number) {
    triggerUiHaptic();
    const total = hour * 60 + minute + delta;
    const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    setHour(Math.floor(wrapped / 60));
    setMinute(wrapped % 60);
  }

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const onceAt =
        frequency === "once"
          ? resolveOnceAt(onceDay, hour, minute)
          : null;
      const payload = {
        title,
        body,
        hour,
        minute,
        frequency,
        weekday: frequency === "weekly" ? weekday : null,
        onceAt,
        enabled: reminder?.enabled ?? true,
      };
      if (reminder) await updateReminder(reminder.id, payload);
      else await createReminder(payload);
      triggerUiHaptic();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={type.sectionTitle}>{reminder ? t("reminders.editTitle") : t("reminders.newTitle")}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("reminders.notificationPlaceholder")}
          placeholderTextColor={colors.muted}
          autoFocus={!reminder}
          style={styles.input}
          returnKeyType="next"
        />
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t("reminders.extraPlaceholder")}
          placeholderTextColor={colors.muted}
          multiline
          style={[styles.input, styles.notes]}
        />

        <Text style={type.label}>{t("reminders.frequency")}</Text>
        <View style={styles.chips}>
          {FREQUENCIES.map((id) => {
            const active = frequency === id;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  triggerUiHaptic();
                  setFrequency(id);
                }}
                style={[styles.chip, active && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{FREQUENCY_LABEL[id]}</Text>
              </Pressable>
            );
          })}
        </View>

        {frequency === "once" ? (
          <>
            <Text style={type.label}>{t("reminders.when")}</Text>
            <View style={styles.chips}>
              {(
                [
                  ["today", t("dates.today")],
                  ["tomorrow", t("dates.tomorrow")],
                ] as const
              ).map(([id, label]) => (
                <Pressable
                  key={id}
                  onPress={() => {
                    triggerUiHaptic();
                    setOnceDay(id);
                  }}
                  style={[styles.chip, onceDay === id && styles.chipOn]}
                >
                  <Text style={[styles.chipLabel, onceDay === id && styles.chipLabelOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {frequency === "weekly" ? (
          <>
            <Text style={type.label}>{t("reminders.day")}</Text>
            <View style={styles.chips}>
              {WEEKDAYS.map((day) => {
                const active = weekday === day.id;
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => {
                      triggerUiHaptic();
                      setWeekday(day.id);
                    }}
                    style={[styles.dayChip, active && styles.chipOn]}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{day.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={type.label}>{t("reminders.time")}</Text>
        <View style={styles.timeRow}>
          <Pressable
            accessibilityLabel={t("reminders.minus15")}
            onPress={() => stepTime(-15)}
            style={({ pressed }) => [styles.step, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.time}>{formatReminderTime(hour, minute)}</Text>
          <Pressable
            accessibilityLabel={t("reminders.plus15")}
            onPress={() => stepTime(15)}
            style={({ pressed }) => [styles.step, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
        <View style={styles.chips}>
          {TIME_PRESETS.map(([h, m]) => {
            const active = hour === h && minute === m;
            return (
              <Pressable
                key={`${h}:${m}`}
                onPress={() => {
                  triggerUiHaptic();
                  setHour(h);
                  setMinute(m);
                }}
                style={[styles.chip, active && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{formatReminderTime(h, m)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!title.trim() || busy}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.submit,
            { opacity: !title.trim() || busy ? 0.4 : pressed ? 0.86 : 1 },
          ]}
        >
          <Text style={styles.submitText}>{busy ? "…" : reminder ? t("common.save") : t("common.create")}</Text>
        </Pressable>
        {reminder ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmDelete(true)}
            style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.deleteText}>{t("common.delete")}</Text>
          </Pressable>
        ) : null}
      </SheetScrollView>
      <ConfirmDialog
        open={confirmDelete}
        title={t("reminders.deleteConfirmTitle")}
        message={t("reminders.deleteConfirmMessage")}
        confirmLabel={t("common.delete")}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!reminder) return;
          void deleteReminder(reminder.id).then(() => {
            setConfirmDelete(false);
            onDone();
          });
        }}
      />
    </>
  );
}

function resolveOnceAt(day: "today" | "tomorrow", hour: number, minute: number): number {
  const base = day === "tomorrow" ? dueTomorrow() : dueToday();
  const when = new Date(base);
  when.setHours(hour, minute, 0, 0);
  if (when.getTime() <= Date.now() + 5_000) return dueTomorrow();
  return startOfDay(when.getTime());
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheetRaised,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  notes: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.sheet,
  },
  dayChip: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    backgroundColor: colors.sheet,
  },
  chipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  chipLabelOn: { color: colors.void },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  time: {
    fontFamily: fonts.serif,
    fontSize: 36,
    lineHeight: 42,
    color: colors.ink,
    minWidth: 120,
    textAlign: "center",
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sheetRaised,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  stepText: {
    fontFamily: fonts.sansMedium,
    fontSize: 22,
    color: colors.ink,
  },
  submit: {
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
  },
  submitText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.accentText,
  },
  deleteBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  deleteText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.danger,
  },
});
