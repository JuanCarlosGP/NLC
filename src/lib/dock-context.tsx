import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { usePathname } from "expo-router";

export const DOCK_HEIGHT = 68;
export const DOCK_MARGIN = 14;

type ScrollHandler = ((event: NativeSyntheticEvent<NativeScrollEvent>) => void) | undefined;

type DockContextValue = {
  enabled: boolean;
  visible: boolean;
  reservedBottom: number;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  reveal: () => void;
};

const DockContext = createContext<DockContextValue | null>(null);

export function DockProvider({
  enabled,
  bottomInset,
  children,
}: {
  enabled: boolean;
  bottomInset: number;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  const lastOffsetY = useRef(0);
  const pathname = usePathname();
  const reservedBottom = DOCK_HEIGHT + DOCK_MARGIN + bottomInset;

  useEffect(() => {
    if (!enabled) return;
    setVisible(true);
    lastOffsetY.current = 0;
  }, [enabled, pathname]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!enabled) return;

      const y = event.nativeEvent.contentOffset.y;
      const dy = y - lastOffsetY.current;

      if (y <= 4) {
        setVisible(true);
      } else if (dy > 10) {
        setVisible(false);
      } else if (dy < -10) {
        setVisible(true);
      }

      lastOffsetY.current = y;
    },
    [enabled],
  );

  const value = useMemo(
    () => ({
      enabled,
      visible,
      reservedBottom,
      handleScroll,
      reveal: () => setVisible(true),
    }),
    [enabled, handleScroll, reservedBottom, visible],
  );

  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

export function useDock(): DockContextValue | null {
  return useContext(DockContext);
}

export function mergeDockOnScroll(
  dock: DockContextValue | null,
  onScroll?: ScrollHandler,
): ScrollHandler {
  if (!dock?.enabled) return onScroll;

  return (event) => {
    onScroll?.(event);
    dock.handleScroll(event);
  };
}
