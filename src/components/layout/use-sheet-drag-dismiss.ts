import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Platform, type View } from "react-native";
import { Gesture, type GestureType } from "react-native-gesture-handler";
import {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const SPRING_OPEN = { damping: 28, stiffness: 420, mass: 0.7 };
const SPRING_BACK = { damping: 24, stiffness: 340 };

type SheetDragDismissOptions = {
  onDismiss: () => void;
  enabled?: boolean;
  dismissDistance?: number;
  dismissVelocity?: number;
  dismissTravel: number;
  closeMs?: number;
  openFadeMs?: number;
  onDismissSettled?: () => void;
  onExpand?: () => void;
  expandEnabled?: boolean;
  expandDistance?: number;
  expandVelocity?: number;
};

type DragPointerState = {
  pending: boolean;
  active: boolean;
  fromHandle: boolean;
  pointerId: number;
  startY: number;
  startX: number;
  lastY: number;
  lastTime: number;
  velocityY: number;
  scrollTopAtStart: number;
};

function rubberbandDrag(dy: number) {
  "worklet";
  return dy > 0 ? dy : dy * 0.15;
}

function finishSheetDrag(
  dy: number,
  velocityY: number,
  slide: SharedValue<number>,
  dragY: SharedValue<number>,
  fade: SharedValue<number>,
  dismissDistance: SharedValue<number>,
  dismissVelocity: SharedValue<number>,
  dismissTravel: SharedValue<number>,
  closeMs: SharedValue<number>,
  notifyDismiss: () => void,
  notifySettled: () => void,
  expandEnabled: SharedValue<number>,
  expandDistance: SharedValue<number>,
  expandVelocity: SharedValue<number>,
  notifyExpand: () => void,
) {
  "worklet";
  if (expandEnabled.value && (dy <= -expandDistance.value || velocityY < -expandVelocity.value)) {
    dragY.value = withSpring(0, SPRING_BACK);
    runOnJS(notifyExpand)();
    return;
  }
  const fastFling = velocityY > dismissVelocity.value || velocityY > 0.35;
  if (dy <= dismissDistance.value && !fastFling) {
    dragY.value = withSpring(0, SPRING_BACK);
    return;
  }

  cancelAnimation(dragY);
  cancelAnimation(slide);
  cancelAnimation(fade);

  const merged = Math.max(0, slide.value) + Math.max(0, dragY.value);
  dragY.value = 0;
  slide.value = merged;

  const travel = dismissTravel.value;
  const remaining = Math.max(0, travel - merged);
  if (remaining <= 1) {
    slide.value = travel;
    fade.value = 0;
    runOnJS(notifyDismiss)();
    runOnJS(notifySettled)();
    return;
  }

  const duration = Math.max(80, Math.round(closeMs.value * (remaining / travel)));
  fade.value = withTiming(0, { duration });
  slide.value = withTiming(travel, { duration }, (finished) => {
    if (finished) runOnJS(notifySettled)();
  });
  runOnJS(notifyDismiss)();
}

function isVerticallyDominant(dy: number, dx: number): boolean {
  return dy >= 10 && Math.abs(dy) > Math.abs(dx) * 1.15;
}

function isHandleTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[data-sheet-drag-handle='true']"));
}

export function useSheetDragDismiss({
  onDismiss,
  enabled = true,
  dismissDistance = 72,
  dismissVelocity = 0.75,
  dismissTravel,
  closeMs = 200,
  openFadeMs = 180,
  onDismissSettled,
  onExpand,
  expandEnabled = false,
  expandDistance = 48,
  expandVelocity = 0.45,
}: SheetDragDismissOptions) {
  const slide = useSharedValue(dismissTravel);
  const dragY = useSharedValue(0);
  const fade = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const contentPanActive = useSharedValue(0);
  const dismissDistanceSV = useSharedValue(dismissDistance);
  const dismissVelocitySV = useSharedValue(dismissVelocity);
  const dismissTravelSV = useSharedValue(dismissTravel);
  const closeMsSV = useSharedValue(closeMs);
  const expandEnabledSV = useSharedValue(expandEnabled ? 1 : 0);
  const expandDistanceSV = useSharedValue(expandDistance);
  const expandVelocitySV = useSharedValue(expandVelocity);

  const onDismissRef = useRef(onDismiss);
  const onDismissSettledRef = useRef(onDismissSettled);
  const onExpandRef = useRef(onExpand);
  const closeFinishedRef = useRef<() => void>(() => {});
  const scrollOffsetRef = useRef(0);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [sheetElement, setSheetElement] = useState<HTMLElement | null>(null);

  onDismissRef.current = onDismiss;
  onDismissSettledRef.current = onDismissSettled;
  onExpandRef.current = onExpand;
  dismissDistanceSV.value = dismissDistance;
  dismissVelocitySV.value = dismissVelocity;
  dismissTravelSV.value = dismissTravel;
  closeMsSV.value = closeMs;
  expandEnabledSV.value = expandEnabled && onExpand ? 1 : 0;
  expandDistanceSV.value = expandDistance;
  expandVelocitySV.value = expandVelocity;

  const notifyDismiss = useCallback(() => onDismissRef.current(), []);
  const notifySettled = useCallback(() => onDismissSettledRef.current?.(), []);
  const notifyExpand = useCallback(() => onExpandRef.current?.(), []);
  const notifyCloseFinished = useCallback(() => closeFinishedRef.current(), []);
  const jsLockScroll = useCallback(() => setScrollLocked(true), []);
  const jsUnlockScroll = useCallback(() => setScrollLocked(false), []);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slide.value + dragY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  const reportScrollOffset = useCallback(
    (offsetY: number) => {
      scrollOffsetRef.current = offsetY <= 2 ? 0 : offsetY;
      scrollY.value = offsetY;
    },
    [scrollY],
  );

  const resetDrag = useCallback(() => {
    cancelAnimation(dragY);
    dragY.value = 0;
    scrollOffsetRef.current = 0;
    scrollY.value = 0;
    setScrollLocked(false);
  }, [dragY, scrollY]);

  const animateOpen = useCallback(() => {
    cancelAnimation(slide);
    cancelAnimation(fade);
    cancelAnimation(dragY);
    dragY.value = 0;
    slide.value = dismissTravel;
    fade.value = 0;
    slide.value = withSpring(0, SPRING_OPEN);
    fade.value = withTiming(1, { duration: openFadeMs });
  }, [dismissTravel, dragY, fade, openFadeMs, slide]);

  const animateClose = useCallback(
    (onFinished: () => void) => {
      closeFinishedRef.current = onFinished;
      cancelAnimation(slide);
      cancelAnimation(fade);
      fade.value = withTiming(0, { duration: closeMs });
      slide.value = withTiming(dismissTravel, { duration: closeMs }, (finished) => {
        if (finished) runOnJS(notifyCloseFinished)();
      });
    },
    [closeMs, dismissTravel, fade, notifyCloseFinished, slide],
  );

  const beginDrag = useCallback(() => {
    cancelAnimation(slide);
    cancelAnimation(dragY);
  }, [dragY, slide]);

  const setDragOffset = useCallback(
    (dy: number) => {
      dragY.value = rubberbandDrag(dy);
    },
    [dragY],
  );

  const finishDrag = useCallback(
    (dy: number, velocityY: number) => {
      finishSheetDrag(
        dy,
        velocityY,
        slide,
        dragY,
        fade,
        dismissDistanceSV,
        dismissVelocitySV,
        dismissTravelSV,
        closeMsSV,
        notifyDismiss,
        notifySettled,
        expandEnabledSV,
        expandDistanceSV,
        expandVelocitySV,
        notifyExpand,
      );
    },
    [
      closeMsSV,
      expandDistanceSV,
      expandEnabledSV,
      expandVelocitySV,
      dismissDistanceSV,
      dismissTravelSV,
      dismissVelocitySV,
      dragY,
      fade,
      notifyDismiss,
      notifyExpand,
      notifySettled,
      slide,
    ],
  );

  const { sheetPanGesture, nativeGesture, handlePanGesture } = useMemo(() => {
    if (Platform.OS === "web") {
      return { sheetPanGesture: null, nativeGesture: null, handlePanGesture: null };
    }

    const native = Gesture.Native().disallowInterruption(false);

    const handlePan = Gesture.Pan()
      .enabled(enabled)
      .maxPointers(1)
      .cancelsTouchesInView(false)
      .shouldCancelWhenOutside(false)
      .onStart(() => {
        cancelAnimation(slide);
        cancelAnimation(dragY);
      })
      .onUpdate((event) => {
        dragY.value = rubberbandDrag(event.translationY);
      })
      .onFinalize((event, success) => {
        if (!success) {
          dragY.value = withSpring(0, SPRING_BACK);
          return;
        }
        finishSheetDrag(
          event.translationY,
          event.velocityY / 1000,
          slide,
          dragY,
          fade,
          dismissDistanceSV,
          dismissVelocitySV,
          dismissTravelSV,
          closeMsSV,
          notifyDismiss,
          notifySettled,
          expandEnabledSV,
          expandDistanceSV,
          expandVelocitySV,
          notifyExpand,
        );
      });

    const pan = Gesture.Pan()
      .manualActivation(true)
      .enabled(enabled)
      .maxPointers(1)
      .cancelsTouchesInView(false)
      .shouldCancelWhenOutside(false)
      .simultaneousWithExternalGesture(native)
      .onTouchesDown((event) => {
        const touch = event.allTouches[0];
        if (!touch) return;
        touchStartX.value = touch.absoluteX;
        touchStartY.value = touch.absoluteY;
      })
      .onTouchesMove((event, manager) => {
        const touch = event.allTouches[0];
        if (!touch) return;
        const dx = touch.absoluteX - touchStartX.value;
        const dy = touch.absoluteY - touchStartY.value;
        if (scrollY.value <= 2 && dy > 10 && dy > Math.abs(dx) * 1.15) {
          runOnJS(jsLockScroll)();
          manager.activate();
          return;
        }
        if (Math.abs(dx) > 14 || dy < -10 || (scrollY.value > 2 && Math.abs(dy) > 10)) {
          manager.fail();
        }
      })
      .onStart(() => {
        contentPanActive.value = 1;
        cancelAnimation(slide);
        cancelAnimation(dragY);
      })
      .onUpdate((event) => {
        dragY.value = rubberbandDrag(event.translationY);
      })
      .onFinalize((event, success) => {
        const started = contentPanActive.value === 1;
        contentPanActive.value = 0;
        runOnJS(jsUnlockScroll)();
        if (!started) return;
        if (!success) {
          dragY.value = withSpring(0, SPRING_BACK);
          return;
        }
        finishSheetDrag(
          event.translationY,
          event.velocityY / 1000,
          slide,
          dragY,
          fade,
          dismissDistanceSV,
          dismissVelocitySV,
          dismissTravelSV,
          closeMsSV,
          notifyDismiss,
          notifySettled,
          expandEnabledSV,
          expandDistanceSV,
          expandVelocitySV,
          notifyExpand,
        );
      });

    native.simultaneousWithExternalGesture(pan);

    return {
      sheetPanGesture: pan,
      nativeGesture: native as GestureType,
      handlePanGesture: handlePan,
    };
  }, [
    closeMsSV,
    contentPanActive,
    dismissDistanceSV,
    dismissTravelSV,
    dismissVelocitySV,
    dragY,
    enabled,
    expandDistanceSV,
    expandEnabledSV,
    expandVelocitySV,
    fade,
    jsLockScroll,
    jsUnlockScroll,
    notifyDismiss,
    notifyExpand,
    notifySettled,
    scrollY,
    slide,
    touchStartX,
    touchStartY,
  ]);

  const setSheetRef = useCallback((node: View | null) => {
    if (Platform.OS !== "web") return;
    setSheetElement(node ? (node as unknown as HTMLElement) : null);
  }, []);

  const getScrollTop = useCallback((root: HTMLElement) => {
    const scrollable = root.querySelector<HTMLElement>('[data-sheet-scroll="true"]');
    if (!scrollable) return scrollOffsetRef.current;
    return scrollable.scrollTop;
  }, []);

  useLayoutEffect(() => {
    if (Platform.OS !== "web" || !enabled || !sheetElement) return;

    const element = sheetElement;
    const dragState: DragPointerState = {
      pending: false,
      active: false,
      fromHandle: false,
      pointerId: -1,
      startY: 0,
      startX: 0,
      lastY: 0,
      lastTime: 0,
      velocityY: 0,
      scrollTopAtStart: 0,
    };

    const resetPointerState = () => {
      dragState.pending = false;
      dragState.active = false;
      dragState.fromHandle = false;
      dragState.pointerId = -1;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      dragState.pending = true;
      dragState.active = false;
      dragState.fromHandle = isHandleTarget(event.target);
      dragState.pointerId = event.pointerId;
      dragState.startY = event.clientY;
      dragState.startX = event.clientX;
      dragState.lastY = event.clientY;
      dragState.lastTime = performance.now();
      dragState.velocityY = 0;
      dragState.scrollTopAtStart = getScrollTop(element);
      if (dragState.scrollTopAtStart <= 2) {
        scrollOffsetRef.current = 0;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;

      const dy = event.clientY - dragState.startY;
      const dx = event.clientX - dragState.startX;

      if (dragState.pending && !dragState.active) {
        if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return;

        if (!dragState.fromHandle) {
          const scrollTop = getScrollTop(element);
          scrollOffsetRef.current = scrollTop <= 2 ? 0 : scrollTop;
          if (scrollTop > 2 || dragState.scrollTopAtStart > 2) {
            resetPointerState();
            return;
          }
          if (!isVerticallyDominant(dy, dx)) {
            resetPointerState();
            return;
          }
        } else if (!isVerticallyDominant(dy, dx) && dy < 4) {
          return;
        }

        dragState.pending = false;
        dragState.active = true;
        beginDrag();
        element.setPointerCapture(event.pointerId);
      }

      if (!dragState.active) return;

      const now = performance.now();
      const dt = now - dragState.lastTime;
      if (dt > 0) {
        dragState.velocityY = (event.clientY - dragState.lastY) / dt;
      }
      dragState.lastY = event.clientY;
      dragState.lastTime = now;
      setDragOffset(dy);
      event.preventDefault();
    };

    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;

      const dy = event.clientY - dragState.startY;
      const velocityY = dragState.velocityY;

      if (dragState.active) {
        try {
          element.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer may already be released.
        }
        finishDrag(dy, velocityY);
      }

      resetPointerState();
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", endDrag);
    element.addEventListener("pointercancel", endDrag);

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", endDrag);
      element.removeEventListener("pointercancel", endDrag);
      resetPointerState();
    };
  }, [beginDrag, enabled, finishDrag, getScrollTop, setDragOffset, sheetElement]);

  const sheetProps = Platform.OS === "web" ? { ref: setSheetRef } : {};

  return {
    sheetProps,
    sheetAnimatedStyle,
    backdropAnimatedStyle,
    sheetPanGesture,
    nativeGesture,
    handlePanGesture,
    scrollLocked,
    reportScrollOffset,
    resetDrag,
    animateOpen,
    animateClose,
  };
}
