import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  BackHandler,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheetProvider } from "@/components/layout/sheet-context";
import { useSheetDragDismiss } from "@/components/layout/use-sheet-drag-dismiss";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors } from "@/lib/theme";

const OPEN_FADE_MS = 180;
const CLOSE_MS = 200;
const SHEET_OVERDRAG_TAIL = 96;
const DEFAULT_VIEWPORT_RATIO = 0.75;

function resolveBottomInset(inset: number): number {
  if (inset > 0) return inset;
  return Platform.select({ ios: 34, android: 24, default: 0 }) ?? 0;
}

/**
 * Sheet inferior (mismo chrome/animación que AppDomus).
 */
export function BottomSheet({
  open,
  onOpenChange,
  children,
  accessibilityCloseLabel = "Cerrar",
  sheetBackgroundColor,
  viewportRatio = DEFAULT_VIEWPORT_RATIO,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  accessibilityCloseLabel?: string;
  sheetBackgroundColor?: string;
  viewportRatio?: number;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const { height: windowHeight } = useWindowDimensions();
  const layoutHeight =
    Platform.OS === "web" ? windowHeight : Math.max(windowHeight - insets.top, 0);
  const viewportCap = layoutHeight * viewportRatio;
  const maxSheetHeight = viewportCap + bottomInset;
  const slideDistance = maxSheetHeight + 48;

  const [mounted, setMounted] = useState(false);
  if (open && !mounted) {
    setMounted(true);
  }

  const dragCloseActiveRef = useRef(false);
  const settleCloseRef = useRef<() => void>(() => {});
  const sheetBg = sheetBackgroundColor ?? colors.sheet;

  const {
    sheetProps,
    sheetAnimatedStyle,
    backdropAnimatedStyle,
    resetDrag,
    animateOpen,
    animateClose,
    reportScrollOffset,
    sheetPanGesture,
    nativeGesture,
    handlePanGesture,
    scrollLocked,
  } = useSheetDragDismiss({
    dismissTravel: slideDistance,
    closeMs: CLOSE_MS,
    openFadeMs: OPEN_FADE_MS,
    onDismiss: () => {
      dragCloseActiveRef.current = true;
      onOpenChange(false);
    },
    onDismissSettled: () => settleCloseRef.current(),
    enabled: mounted && open,
  });

  settleCloseRef.current = () => {
    resetDrag();
    setMounted(false);
    dragCloseActiveRef.current = false;
  };

  useEffect(() => {
    if (!open || Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onOpenChange(false);
      return true;
    });
    return () => sub.remove();
  }, [open, onOpenChange]);

  useLayoutEffect(() => {
    if (!mounted) return;

    if (open) {
      dragCloseActiveRef.current = false;
      resetDrag();
      animateOpen();
      return;
    }

    if (dragCloseActiveRef.current) return;

    animateClose(() => {
      resetDrag();
      setMounted(false);
    });
  }, [animateClose, animateOpen, mounted, open, resetDrag]);

  if (!mounted) return null;

  const handle = (
    <View
      accessibilityLabel="Arrastrar para cerrar"
      accessibilityRole="adjustable"
      collapsable={false}
      {...(Platform.OS === "web" ? ({ "data-sheet-drag-handle": "true" } as object) : null)}
      style={styles.handleWrap}
    >
      <View style={[styles.handle, { backgroundColor: colors.ruleLight }]} />
    </View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
      statusBarTranslucent={Platform.OS !== "web"}
    >
      <GestureHandlerRootView style={styles.root}>
        <View
          style={styles.root}
          pointerEvents={open ? "auto" : "none"}
          accessibilityViewIsModal={open}
        >
          <Animated.View
            style={[styles.backdrop, backdropAnimatedStyle]}
            pointerEvents={open ? "auto" : "none"}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                triggerUiHaptic();
                onOpenChange(false);
              }}
              accessibilityLabel={accessibilityCloseLabel}
            />
          </Animated.View>

          <Animated.View
            {...sheetProps}
            style={[
              styles.sheet,
              {
                height: maxSheetHeight + SHEET_OVERDRAG_TAIL,
                maxHeight: maxSheetHeight + SHEET_OVERDRAG_TAIL,
                paddingBottom: SHEET_OVERDRAG_TAIL,
                marginBottom: -bottomInset - SHEET_OVERDRAG_TAIL,
                backgroundColor: sheetBg,
                borderColor: colors.rule,
              },
              sheetAnimatedStyle,
              Platform.OS === "web" ? ({ touchAction: "pan-y" } as object) : null,
            ]}
          >
            {handlePanGesture ? <GestureDetector gesture={handlePanGesture}>{handle}</GestureDetector> : handle}
            <View style={styles.sheetBody} collapsable={false}>
              <BottomSheetProvider
                reportScrollOffset={reportScrollOffset}
                nativeGesture={nativeGesture}
                scrollLocked={scrollLocked}
              >
                {sheetPanGesture ? (
                  <GestureDetector gesture={sheetPanGesture}>
                    <View style={styles.sheetBodyInner} collapsable={false}>
                      {children}
                    </View>
                  </GestureDetector>
                ) : (
                  children
                )}
              </BottomSheetProvider>
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: "hidden",
    width: "100%",
    flexDirection: "column",
  },
  handleWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    paddingTop: 12,
    paddingBottom: 10,
    flexShrink: 0,
    zIndex: 2,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
  },
  sheetBody: {
    flex: 1,
    minHeight: 0,
  },
  sheetBodyInner: {
    flex: 1,
    minHeight: 0,
  },
});
