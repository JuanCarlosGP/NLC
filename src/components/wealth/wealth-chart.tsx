import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { colors, fonts } from "@/lib/theme";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { formatChartAxis, formatChartScrub, type ChartPoint } from "@/lib/wealth/compute";
import { formatEuro } from "@/lib/wealth/money";
import type { WealthRange } from "@/lib/wealth/types";

const PAD_X = 12;
const PAD_TOP = 18;
const PAD_BOTTOM = 8;

function linePath(coords: { x: number; y: number }[]): string {
  if (!coords.length) return "";
  const pts: { x: number; y: number }[] = [];
  for (const point of coords) {
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(prev.x - point.x) < 0.05) {
      pts[pts.length - 1] = point;
      continue;
    }
    pts.push(point);
  }
  if (pts.length === 1) return `M${fmt(pts[0]!.x)},${fmt(pts[0]!.y)}`;
  if (pts.length === 2) {
    return `M${fmt(pts[0]!.x)},${fmt(pts[0]!.y)} L${fmt(pts[1]!.x)},${fmt(pts[1]!.y)}`;
  }

  const last = pts.length - 1;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < last; i += 1) {
    const span = pts[i + 1]!.x - pts[i]!.x || 1;
    dx.push(span);
    slope.push((pts[i + 1]!.y - pts[i]!.y) / span);
  }
  const tan: number[] = new Array(pts.length);
  tan[0] = slope[0]!;
  tan[last] = slope[last - 1]!;
  for (let i = 1; i < last; i += 1) {
    tan[i] = slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2;
  }
  for (let i = 0; i < last; i += 1) {
    if (Math.abs(slope[i]!) < 1e-6) {
      tan[i] = 0;
      tan[i + 1] = 0;
      continue;
    }
    const a = tan[i]! / slope[i]!;
    const b = tan[i + 1]! / slope[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tan[i] = t * a * slope[i]!;
      tan[i + 1] = t * b * slope[i]!;
    }
  }

  let d = `M${fmt(pts[0]!.x)},${fmt(pts[0]!.y)}`;
  for (let i = 0; i < last; i += 1) {
    const from = pts[i]!;
    const to = pts[i + 1]!;
    const c1x = from.x + dx[i]! / 3;
    const c1y = from.y + (tan[i]! * dx[i]!) / 3;
    const c2x = to.x - dx[i]! / 3;
    const c2y = to.y - (tan[i + 1]! * dx[i]!) / 3;
    d += ` C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(to.x)},${fmt(to.y)}`;
  }
  return d;
}

function fmt(n: number): string {
  return n.toFixed(1);
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
  height = 168,
  fromZero = false,
}: {
  points: ChartPoint[];
  up: boolean;
  range: WealthRange;
  onScrub?: (point: ChartPoint | null) => void;
  height?: number;
  fromZero?: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [boxW, setBoxW] = useState(0);
  const width = Math.max(220, boxW || windowWidth - 72);
  const innerW = width - PAD_X * 2;
  const innerH = height - PAD_TOP - PAD_BOTTOM;
  const fillId = `wealthFill${useId().replace(/:/g, "")}`;
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const layout = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((point) => point.value);
    const last = values[values.length - 1] ?? 0;
    const cap = Math.max(Math.abs(last) * 1.8, 1);
    const usable = values.filter((value) => Math.abs(value) <= cap);
    const rawMin = Math.min(...(usable.length ? usable : values));
    const rawMax = Math.max(...(usable.length ? usable : values), last);
    const pad = (rawMax - rawMin) * 0.12 || Math.max(Math.abs(rawMax) * 0.06, 1);
    const min = fromZero && rawMin > 0 ? 0 : rawMin - pad;
    const max = fromZero && rawMax < 0 ? 0 : rawMax + pad;
    const span = max - min || 1;
    const t0 = points[0]!.at;
    const t1 = points[points.length - 1]!.at;
    const timeSpan = t1 - t0 || 1;
    const coords = points.map((point) => {
      const y = PAD_TOP + (1 - (point.value - min) / span) * innerH;
      return {
        x: PAD_X + ((point.at - t0) / timeSpan) * innerW,
        y: Math.min(PAD_TOP + innerH, Math.max(PAD_TOP, y)),
      };
    });
    return { min, max, t0, t1, timeSpan, coords, innerW };
  }, [fromZero, innerH, innerW, points]);
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
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: (event) => inspect(event.nativeEvent.locationX),
        onPanResponderMove: (event) => inspect(event.nativeEvent.locationX),
        onPanResponderRelease: () => undefined,
        onPanResponderTerminate: () => undefined,
      }),
    [],
  );

  function inspect(locationX: number) {
    const current = layoutRef.current;
    const series = pointsRef.current;
    if (!current || series.length < 2) return;
    const x = Math.min(PAD_X + current.innerW, Math.max(PAD_X, locationX));
    const at = current.t0 + ((x - PAD_X) / current.innerW) * current.timeSpan;
    const idx = indexAtTime(series, at);
    const point = series[idx];
    const coord = current.coords[idx];
    if (!point || !coord) return;
    if (idx === series.length - 1) {
      lastIdx.current = null;
      setCursor(null);
      onScrubRef.current?.(null);
      return;
    }
    if (lastIdx.current !== idx) {
      lastIdx.current = idx;
      triggerSelectionUiHaptic();
    }
    setCursor({ x: coord.x, y: coord.y, point });
    onScrubRef.current?.(point);
  }

  if (!layout) {
    return <View style={[styles.frame, { height }]} />;
  }

  const { coords } = layout;
  const last = coords[coords.length - 1]!;
  const first = coords[0]!;
  const line = linePath(coords);
  const floorY = PAD_TOP + innerH;
  const area = `${line} L${fmt(last.x)},${fmt(floorY)} L${fmt(first.x)},${fmt(floorY)} Z`;
  const stroke = up ? colors.ok : colors.danger;
  const startLabel = formatChartAxis(points[0]!.at, range);
  const endLabel = formatChartAxis(points[points.length - 1]!.at, range);
  const marked = cursor?.point;
  const live = !marked;

  return (
    <View style={styles.wrap} onLayout={(event) => setBoxW(event.nativeEvent.layout.width)}>
      <View
        collapsable={false}
        style={[styles.frame, { height, width }]}
        {...pan.panHandlers}
      >
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} pointerEvents="none">
          <Defs>
            <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${fillId})`} />
          <Path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {cursor ? (
            <Circle cx={cursor.x} cy={cursor.y} r={4.5} fill={colors.ink} stroke={stroke} strokeWidth={2} />
          ) : (
            <Circle cx={last.x} cy={last.y} r={3.5} fill={stroke} />
          )}
        </Svg>
      </View>
      <View style={[styles.meta, { width }]}>
        <Text style={styles.metaSide}>{startLabel}</Text>
        <Text style={[styles.metaMid, live ? styles.metaLive : styles.metaPin]} numberOfLines={1}>
          {live ? " " : `${formatChartScrub(marked.at, range)} · ${formatEuro(marked.value)}`}
        </Text>
        <Text style={[styles.metaSide, styles.metaEnd]}>{endLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, width: "100%" },
  frame: {
    overflow: "hidden",
    ...(Platform.OS === "web" ? ({ userSelect: "none" } as object) : null),
  },
  meta: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  metaSide: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
    flexShrink: 0,
    minWidth: 52,
  },
  metaEnd: { textAlign: "right" },
  metaMid: {
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  metaLive: { color: colors.inkSoft },
  metaPin: { color: colors.ink },
});
