import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export function TintWash({
  id,
  from,
  to,
  style,
  fromOpacity = 0.78,
}: {
  id: string;
  from: string;
  to: string;
  style?: StyleProp<ViewStyle>;
  fromOpacity?: number;
}) {
  const gid = `wash-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <Svg pointerEvents="none" style={style} viewBox="0 0 10 40" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={from} stopOpacity={fromOpacity} />
          <Stop offset="0.38" stopColor={from} stopOpacity={0.34} />
          <Stop offset="0.68" stopColor={to} stopOpacity={0.72} />
          <Stop offset="1" stopColor={to} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect width="10" height="40" fill={`url(#${gid})`} />
    </Svg>
  );
}

export const tintWashStyles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});
