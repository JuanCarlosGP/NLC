import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { colors } from "@/lib/theme";
import type { ChartPoint } from "@/lib/wealth/compute";

export function WealthChart({
  points,
  up,
}: {
  points: ChartPoint[];
  up: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(280, windowWidth - 40);
  const height = 148;
  const pad = 4;

  if (points.length < 2) {
    return <View style={[styles.frame, { height }]} />;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const coords = points.map((point, index) => {
    const x = pad + (index / (points.length - 1)) * innerW;
    const y = pad + innerH - ((point.value - min) / span) * innerH;
    return { x, y };
  });
  const d = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const stroke = up ? colors.ok : colors.danger;
  const zeroY = pad + innerH - ((0 - min) / span) * innerH;

  return (
    <View style={styles.frame}>
      <Svg width={width} height={height}>
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
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginHorizontal: -4,
  },
});
