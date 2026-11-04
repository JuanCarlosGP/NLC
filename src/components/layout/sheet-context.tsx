import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createContext, useContext, type ReactNode } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { GestureType } from "react-native-gesture-handler";

type BottomSheetContextValue = {
  reportScrollOffset: (offsetY: number) => void;
  reportContentHeight?: (height: number) => void;
  nativeGesture: GestureType | null;
  scrollLocked: boolean;
};

const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

export function BottomSheetProvider({
  reportScrollOffset,
  reportContentHeight,
  nativeGesture,
  scrollLocked,
  children,
}: {
  reportScrollOffset: (offsetY: number) => void;
  reportContentHeight?: (height: number) => void;
  nativeGesture: GestureType | null;
  scrollLocked: boolean;
  children: ReactNode;
}) {
  useThemeId();
  return (
    <BottomSheetContext.Provider value={{ reportScrollOffset, reportContentHeight, nativeGesture, scrollLocked }}>
      {children}
    </BottomSheetContext.Provider>
  );
}

export function useBottomSheet(): BottomSheetContextValue | null {
  return useContext(BottomSheetContext);
}

export function mergeSheetScrollProps(
  sheet: BottomSheetContextValue | null,
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
) {
  if (!sheet) return onScroll;

  return (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    sheet.reportScrollOffset(event.nativeEvent.contentOffset.y);
    onScroll?.(event);
  };
}
