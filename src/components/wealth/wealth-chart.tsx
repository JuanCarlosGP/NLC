import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { colors, fonts } from "@/lib/theme";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { formatChartScrub, type ChartPoint } from "@/lib/wealth/compute";
import { formatEuro } from "@/lib/wealth/money";
import type { WealthRange } from "@/lib/wealth/types";

function isMajorTick(at: number, range: WealthRange): boolean {
  const date = new Date(at);
  if (range === "1d") return date.getMinutes() === 0;
  if (range === "1w") return date.getHours() === 0 && date.getMinutes() === 0;
  if (range === "1m") return date.getHours() === 0 && date.getMinutes() === 0;
  return date.getDate() === 1;
}

function indexAtTime(points: ChartPoint[], at: number): number {
  let best = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i]!.at <= at) best = i;
    else break;
  }
  const next = points[best + 1];
  if (next && at - points[best]!.at > next.at - at) return best + 1;
  return best;
}

export function WealthChart({
  points,
  up,
  range,
  onScrub,
}: {
  points: ChartPoint[];
  up: boolean;
  range: WealthRange;
  onScrub?: (point: ChartPoint | null) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(280, windowWidth - 40);
  const height = 148;
  const pad = 4;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const layout = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const t0 = points[0]!.at;
    const t1 = points[points.length - 1]!.at;
    const timeSpan = t1 - t0 || 1;
    const coords = points.map((point) => ({
      x: pad + ((point.at - t0) / timeSpan) * innerW,
      y: pad + innerH - ((point.value - min) / span) * innerH,
    }));
    return { min, max, t0, t1, timeSpan, coords, innerW, pad };
  }, [innerH, innerW, points]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const lastIdx = useRef<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; point: ChartPoint } | null>(null);

  useEffect(() => {
    lastIdx.current = null;
    setCursor(null);
    onScrubRef.current?.(null);
  }, [range]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => inspect(event.nativeEvent.locationX),
        onPanResponderMove: (event) => inspect(event.nativeEvent.locationX),
        onPanResponderRelease: () => clear(),
        onPanResponderTerminate: () => clear(),
      }),
    [],
  );

  function inspect(locationX: number) {
    const current = layoutRef.current;
    const series = pointsRef.current;
    if (!current || series.length < 2) return;
    const x = Math.min(current.pad + current.innerW, Math.max(current.pad, locationX));
    const at = current.t0 + ((x - current.pad) / current.innerW) * current.timeSpan;
    const idx = indexAtTime(series, at);
    const point = series[idx];
    const coord = current.coords[idx];
    if (!point || !coord) return;
    if (lastIdx.current !== idx) {
      lastIdx.current = idx;
      triggerSelectionUiHaptic();
    }
    setCursor({ x: coord.x, y: coord.y, point });
    onScrubRef.current?.(point);
  }

  function clear() {
    lastIdx.current = null;
    setCursor(null);
    onScrubRef.current?.(null);
  }

  if (!layout) {
    return <View style={[styles.frame, { height }]} />;
  }

  const { min, max, coords } = layout;
  const d = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const stroke = up ? colors.ok : colors.danger;
  const zeroY = pad + innerH - ((0 - min) / (max - min || 1)) * innerH;
  const tipWidth = 148;
  const tipLeft = cursor
    ? Math.min(width - tipWidth, Math.max(0, cursor.x - tipWidth / 2))
    : 0;

  return (
    <View
      collapsable={false}
      style={[
        styles.frame,
        { height, width },
        Platform.OS === "web" ? ({ cursor: "ew-resize", userSelect: "none" } as object) : null,
      ]}
      {...pan.panHandlers}
    >
      <Svg width={width} height={height} pointerEvents="none">
        {coords.map((coord, index) => {
          const point = points[index];
          if (!point || !isMajorTick(point.at, range)) return null;
          return (
            <Line
              key={`${point.at}-${index}`}
              x1={coord.x}
              x2={coord.x}
              y1={pad}
              y2={height - pad}
              stroke={colors.rule}
              strokeWidth={1}
            />
          );
        })}
        {min < 0 && max > 0 ? (
          <Line
            x1={pad}
            x2={width - pad}
            y1={zeroY}
            y2={zeroY}
            stroke={colors.ruleLight}
            strokeDasharray="4 6"
            strokeWidth={1}
          />
        ) : null}
        <Path d={d} fill="none" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        {cursor ? (
          <>
            <Line
              x1={cursor.x}
              x2={cursor.x}
              y1={pad}
              y2={height - pad}
              stroke={colors.ink}
              strokeWidth={1.2}
            />
            <Circle cx={cursor.x} cy={cursor.y} r={5} fill={stroke} stroke={colors.void} strokeWidth={2} />
          </>
        ) : null}
      </Svg>
      {cursor ? (
        <View pointerEvents="none" style={[styles.tip, { left: tipLeft, width: tipWidth }]}>
          <Text style={styles.tipValue}>{formatEuro(cursor.point.value)}</Text>
          <Text style={styles.tipTime}>{formatChartScrub(cursor.point.at, range)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginHorizontal: -4,
  },
  tip: {
    position: "absolute",
    top: 8,
    alignItems: "center",
    gap: 1,
  },
  tipValue: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.ink,
  },
  tipTime: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
});
