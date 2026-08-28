import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/lib/theme";

const EASE = Easing.out(Easing.cubic);
const LEN = 22;
const AnimatedPath = Animated.createAnimatedComponent(Path);

export function XMark({
  play,
  reduce,
  size = 28,
  color = colors.danger,
}: {
  play: boolean;
  reduce: boolean;
  size?: number;
  color?: string;
}) {
  const first = useSharedValue(reduce || play ? 1 : 0);
  const second = useSharedValue(reduce || play ? 1 : 0);

  useEffect(() => {
    if (reduce) {
      first.value = play ? 1 : 0;
      second.value = play ? 1 : 0;
      return;
    }
    if (!play) {
      first.value = 0;
      second.value = 0;
      return;
    }
    first.value = 0;
    second.value = 0;
    first.value = withTiming(1, { duration: 420, easing: EASE });
    second.value = withDelay(200, withTiming(1, { duration: 420, easing: EASE }));
  }, [first, play, reduce, second]);

  const firstProps = useAnimatedProps(() => ({
    opacity: interpolate(first.value, [0, 0.08, 1], [0, 1, 1]),
    strokeDashoffset: interpolate(first.value, [0, 1], [LEN, 0]),
  }));
  const secondProps = useAnimatedProps(() => ({
    opacity: interpolate(second.value, [0, 0.08, 1], [0, 1, 1]),
    strokeDashoffset: interpolate(second.value, [0, 1], [LEN, 0]),
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
        <AnimatedPath
          animatedProps={firstProps}
          d="M18 6 6 18"
          stroke={color}
          strokeDasharray={LEN}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <AnimatedPath
          animatedProps={secondProps}
          d="m6 6 12 12"
          stroke={color}
          strokeDasharray={LEN}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </Svg>
    </View>
  );
}
