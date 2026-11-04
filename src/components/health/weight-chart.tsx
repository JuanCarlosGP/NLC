import { createStyles } from "@/lib/appearance/density";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { weightChartPoints, type WeightEntry } from "@/lib/health/weight/model";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts, type } from "@/lib/theme";
import { weightDate, weightNumber } from "./weight-format";

export function WeightChart({ entries, fromDate }: { entries: WeightEntry[]; fromDate?: string }) {
  const { t, locale } = useI18n();
  const [width, setWidth] = useState(260);
  const points = useMemo(() => weightChartPoints(entries, fromDate), [entries, fromDate]);
  if (!points.length) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const start = Date.parse(`${first.date}T12:00:00Z`);
  const end = Date.parse(`${last.date}T12:00:00Z`);
  const values = points.flatMap((point) => [point.weightKg, point.average7d]);
  const low = Math.min(...values) - 0.5;
  const high = Math.max(...values) + 0.5;
  const x = (date: string) => end === start ? width / 2 : 8 + ((Date.parse(`${date}T12:00:00Z`) - start) / (end - start)) * (width - 16);
  const y = (value: number) => 12 + ((high - value) / (high - low)) * 140;
  const path = (key: "weightKg" | "average7d") => points.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  return (
    <View style={styles.card}>
      <View style={styles.legend}>
        <Text style={styles.measured}>{t("health.measured")}</Text>
        <Text style={type.meta}>{t("health.average7d")}</Text>
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={t("health.chartLabel", { first: weightDate(first.date, locale), last: weightDate(last.date, locale) })}
        onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}>
        <Svg width={width} height={164}>
          {[12, 82, 152].map((row) => <Line key={row} x1={0} x2={width} y1={row} y2={row} stroke={colors.rule} strokeDasharray="3 5" />)}
          <Path d={path("average7d")} stroke={colors.muted} strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
          <Path d={path("weightKg")} stroke={colors.accent} strokeWidth={2} strokeLinejoin="round" fill="none" />
          <Circle cx={x(last.date)} cy={y(last.weightKg)} r={4} fill={colors.accent} />
        </Svg>
      </View>
      <View style={styles.axis}>
        <Text style={type.meta}>{weightDate(first.date, locale)}</Text>
        <Text style={type.meta}>{weightDate(last.date, locale)}</Text>
      </View>
      <Text style={styles.bounds}>{weightNumber(Math.min(...values), locale)}–{weightNumber(Math.max(...values), locale)} kg</Text>
    </View>
  );
}

const styles = createStyles({
  card: { borderWidth: 1, borderColor: colors.rule, borderRadius: 14, backgroundColor: colors.sheet, padding: 16, gap: 10 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  measured: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.accent },
  axis: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  bounds: { ...type.meta, textAlign: "right" },
});
