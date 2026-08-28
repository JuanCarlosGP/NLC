import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/lib/theme";

const EASE = Easing.out(Easing.cubic);

export function PartyPopper({
  play,
  reduce,
  size = 28,
  color = colors.ok,
}: {
  play: boolean;
  reduce: boolean;
  size?: number;
  color?: string;
}) {
  const burst = useSharedValue(reduce || play ? 1 : 0);

  useEffect(() => {
    if (reduce) {
      burst.value = play ? 1 : 0;
      return;
    }
    if (!play) {
      burst.value = 0;
      return;
    }
    burst.value = 0;
    burst.value = withTiming(1, { duration: 700, easing: EASE });
  }, [burst, play, reduce]);

  const burstStyle = useAnimatedStyle(() => ({
    opacity: interpolate(burst.value, [0, 0.18, 1], [0, 1, 1]),
    transform: [
      { translateX: interpolate(burst.value, [0, 1], [-5, 0]) },
      { translateY: interpolate(burst.value, [0, 1], [5, 0]) },
      { scale: interpolate(burst.value, [0, 0.35, 0.7, 0.88, 1], [0.3, 0.8, 1, 1.12, 1]) },
    ],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Animated.View style={burstStyle}>
        <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
          <Path
            d="M5.8 11.3 2 22l10.7-3.79"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <Path
            d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <Path d="M4 3h.01" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <Path d="M22 8h.01" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <Path d="M15 2h.01" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <Path d="M22 20h.01" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <Path
            d="m14 10 1.21-1.06c0.16-0.84 0.9-1.44 1.76-1.44h0.38c0.88 0 1.55-0.77 1.45-1.63a2.9 2.9 0 0 1 1.96-3.12L22 2"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <Path
            d="M17 15h0.77c0.71 0 1.32-0.52 1.43-1.22c0.16-0.91 1.12-1.45 1.98-1.11L22 13"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <Path
            d="M9 7V6.23c0-0.71 0.52-1.33 1.22-1.43c0.91-0.16 1.45-1.12 1.11-1.98L11 2"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
