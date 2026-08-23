import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  type KeyboardEvent,
  useWindowDimensions,
} from "react-native";
import { USE_NATIVE_DRIVER } from "@/lib/use-native-driver";

export function useKeyboardBottomOverlap(enabled: boolean) {
  const { height: windowHeight } = useWindowDimensions();
  const [overlap, setOverlap] = useState(0);
  const lift = useRef(new Animated.Value(0)).current;
  const windowHeightRef = useRef(windowHeight);
  windowHeightRef.current = windowHeight;

  useEffect(() => {
    if (!enabled) {
      setOverlap(0);
      lift.stopAnimation();
      lift.setValue(0);
      return;
    }

    function overlapFromEvent(event: KeyboardEvent): number {
      const screenY = event.endCoordinates.screenY;
      const next = Math.max(0, Math.round(windowHeightRef.current - screenY));
      return next < 40 ? 0 : next;
    }

    function animateTo(next: number, duration?: number) {
      setOverlap(next);
      const ms =
        typeof duration === "number" && duration > 0
          ? duration
          : Platform.OS === "ios"
            ? 250
            : 220;
      Animated.timing(lift, {
        toValue: next,
        duration: ms,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    }

    if (Platform.OS === "web") {
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      if (!vv) return;
      const update = () => {
        const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        const next = covered < 40 ? 0 : Math.round(covered);
        setOverlap(next);
        lift.stopAnimation();
        lift.setValue(next);
      };
      update();
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
      return () => {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      };
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const changeEvent =
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidChangeFrame";

    const onShowOrChange = (event: KeyboardEvent) => {
      animateTo(overlapFromEvent(event), event.duration);
    };
    const onHide = (event: KeyboardEvent) => {
      animateTo(0, event.duration);
    };

    const subs = [
      Keyboard.addListener(showEvent, onShowOrChange),
      Keyboard.addListener(hideEvent, onHide),
      Keyboard.addListener(changeEvent, onShowOrChange),
    ];

    return () => {
      for (const sub of subs) sub.remove();
    };
  }, [enabled, lift]);

  return { overlap, lift };
}
