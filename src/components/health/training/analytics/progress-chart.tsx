import { space } from "@/lib/appearance/density";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { metricChange, progressGeometry, roundTraining, type ExercisePoint, type ProgressMetric } from "@/lib/health/training/analytics";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button, styles } from "../ui";

export function ProgressChart({ points, metric }: { points: ExercisePoint[]; metric: ProgressMetric }) {
  const { t, locale } = useI18n(); const router = useRouter(); const [width, setWidth] = useState(240); const [end, setEnd] = useState(points.length); const [selected, setSelected] = useState<string | null>(null);
  const limit = Math.min(end, points.length); const start = Math.max(0, limit - 24); const visible = points.slice(start, limit);
  const geometry = useMemo(() => progressGeometry(visible, metric, width), [visible, metric, width]);
  const current = visible.find((point) => point.sessionId === selected) ?? [...visible].reverse().find((point) => point[metric] !== null);
  const currentIndex = current ? visible.indexOf(current) : -1;
  const change = metricChange(points, metric); const unit = metric === "volume" ? t("trainingAnalytics.kgReps") : metric === "reps" ? t("trainingAnalytics.repsUnit") : "kg";
  const num = (value: number) => roundTraining(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  function move(next: number) { setEnd(next); setSelected(null); }
  return <View style={styles.card}>
    <Text style={type.sectionTitle}>{t(`trainingAnalytics.${metric}`)}</Text>
    <Text style={type.meta}>{t("trainingAnalytics.pointHint")}</Text>

    {geometry ? <>
      <View style={{ flexDirection: "row", gap: space(8) }}>
        <View style={{ width: 42, justifyContent: "space-between", paddingTop: 3, paddingBottom: space(4) }}><Text style={[type.meta, { fontSize: 11 }]}>{num(geometry.high)}</Text><Text style={[type.meta, { fontSize: 11 }]}>0 {unit}</Text></View>
        <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={t("trainingAnalytics.chartLabel", { metric: t(`trainingAnalytics.${metric}`), from: date(visible[0].date), to: date(visible[visible.length - 1].date) })} onLayout={(event) => setWidth(Math.max(100, event.nativeEvent.layout.width))}>
          <Svg width={width} height={164}>
            {[12, 82, 152].map((y) => <Line key={y} x1={0} x2={width} y1={y} y2={y} stroke={colors.rule} strokeDasharray="3 5" />)}
            {geometry.paths.map((path, i) => <Path key={i} d={path} fill="none" stroke={colors.accent} strokeWidth={2} />)}
            {geometry.dots.map((dot) => <G key={dot.index} onPress={() => setSelected(visible[dot.index].sessionId)}><Circle cx={dot.x} cy={dot.y} r={12} fill="transparent" /><Circle cx={dot.x} cy={dot.y} r={current?.sessionId === visible[dot.index].sessionId ? 6 : 4} fill={current?.sessionId === visible[dot.index].sessionId ? colors.ok : colors.accent} /></G>)}
          </Svg>
        </View>
      </View>
      <View style={styles.spread}><Text style={type.meta}>{date(visible[0].date)}</Text><Text style={type.meta}>{date(visible[visible.length - 1].date)}</Text></View>
    </> : <Text style={type.body}>{t("trainingAnalytics.noMetric")}</Text>}
    {current ? <View style={{ gap: space(8), borderTopWidth: 1, borderColor: colors.rule, paddingTop: space(12) }}>
      <Text style={type.body}>{date(current.date)} · {current.sessionName || t("training.title")}</Text>
      <Text style={type.sectionTitle}>{current[metric] === null ? t("trainingAnalytics.unknown") : `${num(current[metric]!)} ${unit}`}</Text>
      <View style={styles.row}><Button title={t("trainingAnalytics.previousPoint")} disabled={currentIndex <= 0} onPress={() => setSelected(visible[currentIndex - 1].sessionId)} /><Button title={t("trainingAnalytics.nextPoint")} disabled={currentIndex < 0 || currentIndex >= visible.length - 1} onPress={() => setSelected(visible[currentIndex + 1].sessionId)} /></View>
      <Button title={t("trainingAnalytics.openSession")} onPress={() => router.push(`/health/training/session/${current.sessionId}`)} />
    </View> : null}
    {points.length > 24 ? <><Text style={type.meta}>{t("trainingAnalytics.pointCount", { from: start + 1, to: limit, total: points.length })}</Text><View style={styles.row}>
      <Button title={t("trainingAnalytics.earlier")} disabled={start === 0} onPress={() => move(start)} />
      <Button title={t("trainingAnalytics.later")} disabled={limit === points.length} onPress={() => move(Math.min(points.length, limit + 24))} />
    </View></> : null}
    <Text style={type.body}>{change ? t("trainingAnalytics.delta", { first: num(change.first), last: num(change.last), unit, difference: `${change.difference > 0 ? "+" : ""}${num(change.difference)}` }) : t("trainingAnalytics.onePoint")}</Text>
    {change?.percent !== null && change?.percent !== undefined ? <Text style={type.meta}>{t("trainingAnalytics.percent", { value: `${change.percent > 0 ? "+" : ""}${num(change.percent)}` })}</Text> : null}
  </View>;
}
