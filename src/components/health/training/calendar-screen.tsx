import { useIntegrations } from "@/lib/integrations/integrations-context";
import { WhoopCalendarActivities } from "@/components/integrations/whoop-screen";
import { space } from "@/lib/appearance/density";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui/screen";
import { useTraining } from "@/lib/health/training/training-context";
import { monthDays, shiftMonth } from "@/lib/health/training/model";
import { localDateKey } from "@/lib/health/weight/model";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts, type } from "@/lib/theme";
import { Button, Header, SessionRow, TrainingLoadState, styles } from "./ui";
import { SessionComposer } from "./session-composer";

export function TrainingCalendar() {
  const { t, locale } = useI18n(); const { sessions, ready, loadFailed } = useTraining();
  const integrations = useIntegrations(); const whoop = integrations.copies.whoop[integrations.selection.whoop]; const activities = whoop?.provider === "whoop" ? whoop.activities : [];
  const today = localDateKey(); const [selected, setSelected] = useState(today); const [month, setMonth] = useState(today.slice(0, 7)); const [open, setOpen] = useState(false);
  const daySessions = sessions.filter((session) => session.date === selected);
  function move(delta: number) { const next = shiftMonth(month, delta); setMonth(next); setSelected(`${next}-01`); }
  return <><Screen><Header title={t("training.calendar")} /><TrainingLoadState />
    {ready && !loadFailed ? <>
      <View style={styles.card}>
        <View style={styles.spread}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("training.prevMonth")} onPress={() => move(-1)} style={styles.button}><Text style={styles.buttonText}>‹</Text></Pressable>
          <Text style={[type.sectionTitle, { flex: 1, textAlign: "center" }]}>{new Date(`${month}-01T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("training.nextMonth")} onPress={() => move(1)} style={styles.button}><Text style={styles.buttonText}>›</Text></Pressable>
        </View>
        <View style={{ flexDirection: "row" }}>{Array.from({ length: 7 }, (_, i) => <Text key={i} style={[type.meta, { width: "14.285714%", textAlign: "center" }]}>{new Date(Date.UTC(2026, 10, 2 + i, 12)).toLocaleDateString(locale, { weekday: "narrow", timeZone: "UTC" })}</Text>)}</View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {monthDays(month).map((day, index) => {
            const count = day ? sessions.filter((session) => session.date === day).length : 0;
            const activityCount = day ? activities.filter(activity => activity.date === day).length : 0;
            return <View key={day ?? `empty-${index}`} style={{ width: "14.285714%", padding: 2 }}>
              {day ? <Pressable accessibilityRole="button" accessibilityLabel={`${t("training.dayLabel", { date: day, count })}${activityCount ? ` · ${t("integrations.calendarCount", {count:activityCount})}` : ""}`} accessibilityState={{ selected: day === selected }} onPress={() => setSelected(day)}
                style={{ minHeight: 45, paddingVertical: 7, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: day === today ? colors.accent : "transparent", backgroundColor: day === selected ? colors.accent : "transparent", gap: space(4) }}>
                <Text style={{ fontFamily: fonts.sansMedium, color: day === selected ? colors.accentText : colors.ink }}>{Number(day.slice(8))}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: count ? day === selected ? colors.accentText : colors.accent : "transparent" }} /><View style={{ width: 6, height: 2, backgroundColor: activityCount ? day === selected ? colors.accentText : colors.accent : "transparent" }} /></View>
              </Pressable> : null}
            </View>;
          })}
        </View>
        <Button title={t("training.today")} onPress={() => { setMonth(today.slice(0, 7)); setSelected(today); }} />
      </View>
      <Text style={type.sectionTitle}>{new Date(`${selected}T12:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</Text>
      {daySessions.length ? daySessions.map((session) => <SessionRow key={session.id} session={session} />) : <Text style={type.body}>{t("training.noDay")}</Text>}
      <WhoopCalendarActivities date={selected} />
      <Button primary title={t("training.addDay")} onPress={() => setOpen(true)} />
    </> : null}
  </Screen><SessionComposer open={open} date={selected} onClose={() => setOpen(false)} /></>;
}
