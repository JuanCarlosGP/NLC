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
/** Below MiniPlayer (35) and Dock (40) so chrome stays visible/tappable. */
const OVERLAY_Z_INDEX = 30;

export function resolveBottomInset(inset: number): number {
  if (inset > 0) return inset;
  return Platform.select({ ios: 34, android: 24, default: 0 }) ?? 0;
}

/**
 * Sheet inferior (mismo chrome/animación que AppDomus).
 * `presentation="overlay"` evita Modal para dejar visible el dock / mini player.
 */
export function BottomSheet({
  open,
  onOpenChange,
  children,
  accessibilityCloseLabel = "Cerrar",
  sheetBackgroundColor,
  viewportRatio = DEFAULT_VIEWPORT_RATIO,
  expandable = false,
  expandedRatio = 0.92,
  presentation = "modal",
  reserveBottom = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  accessibilityCloseLabel?: string;
  sheetBackgroundColor?: string;
  viewportRatio?: number;
  /** Swipe up from the collapsed height to grow the sheet. */
  expandable?: boolean;
  expandedRatio?: number;
  presentation?: "modal" | "overlay";
  /** Extra space above the bottom edge (e.g. dock + mini player). */
  reserveBottom?: number;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = resolveBottomInset(insets.bottom);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const chrome = Math.max(0, reserveBottom);
  const ratio = expandable && expanded ? expandedRatio : viewportRatio;
  const [layoutHeight, setLayoutHeight] = useState(() =>
    Platform.OS === "web" ? windowHeight : Math.max(windowHeight - insets.top, 0),
  );

  const windowHeightRef = useRef(windowHeight);
  windowHeightRef.current = windowHeight;

  useLayoutEffect(() => {
    if (!open) return;
    const next =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.innerHeight
        : Math.max(windowHeightRef.current - insets.top, 0);
    setLayoutHeight(next);
  }, [open, windowWidth, insets.top]);

  const viewportCap = layoutHeight * ratio;
  const available = Math.max(layoutHeight - chrome, 160);
  const maxSheetHeight = Math.min(viewportCap, available) + (chrome > 0 ? 0 : bottomInset);
  const slideDistance = maxSheetHeight + 48;
  const overlay = presentation === "overlay";
  const sheetMarginBottom = chrome > 0 ? chrome - SHEET_OVERDRAG_TAIL : -bottomInset - SHEET_OVERDRAG_TAIL;

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
    expandEnabled: expandable && !expanded,
    onExpand: expandable
      ? () => {
          triggerUiHaptic();
          setExpanded(true);
        }
      : undefined,
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

  useEffect(() => {
    if (open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (Platform.OS !== "web" || !open || typeof window === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    const pin = () => window.scrollTo(0, 0);
    pin();
    window.addEventListener("scroll", pin);
    document.addEventListener("focusin", pin);
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      window.removeEventListener("scroll", pin);
      document.removeEventListener("focusin", pin);
    };
  }, [open]);

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
      accessibilityLabel={expandable ? "Arrastrar para ampliar o cerrar" : "Arrastrar para cerrar"}
      accessibilityRole="adjustable"
      collapsable={false}
      {...(Platform.OS === "web" ? ({ "data-sheet-drag-handle": "true" } as object) : null)}
      style={styles.handleWrap}
    >
      <View style={[styles.handle, { backgroundColor: colors.ruleLight }]} />
    </View>
  );

  const webFrame =
    Platform.OS === "web"
      ? ({
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          width: "100%",
          height: layoutHeight,
        } as object)
      : null;

  const body = (
    <GestureHandlerRootView style={[styles.root, webFrame]} pointerEvents={overlay ? "box-none" : "auto"}>
      <View
        style={[styles.root, webFrame]}
        pointerEvents={open ? (overlay ? "box-none" : "auto") : "none"}
        accessibilityViewIsModal={open && !overlay}
      >
        <Animated.View
          style={[
            styles.backdrop,
            chrome > 0 ? { bottom: chrome } : null,
            backdropAnimatedStyle,
          ]}
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
              marginBottom: sheetMarginBottom,
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
  );

  if (overlay) {
    return (
      <View
        pointerEvents={open ? "box-none" : "none"}
        style={[
          styles.overlayHost,
          Platform.OS === "web" ? ({ position: "fixed" } as object) : null,
        ]}
      >
        {body}
      </View>
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
      statusBarTranslucent={Platform.OS !== "web"}
    >
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: OVERLAY_Z_INDEX,
  },
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
