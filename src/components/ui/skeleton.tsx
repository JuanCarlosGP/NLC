import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type ViewStyle } from "react-native";
import { colors } from "@/lib/theme";

export function Bone({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 1100, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.42, duration: 1100, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.bone, style, { opacity }]} />;
}

const styles = StyleSheet.create({
  bone: {
    backgroundColor: colors.rule,
    borderRadius: 4,
  },
});
