import { type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { mergeSheetScrollProps, useBottomSheet } from "@/components/layout/sheet-context";
import { mergeDockOnScroll, useDock } from "@/lib/dock-context";

export function SheetScrollView({
  children,
  style,
  contentContainerStyle,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const sheet = useBottomSheet();
  const dock = useDock();

  const scroll = (
    <ScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      bounces={false}
      overScrollMode="never"
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      scrollEnabled={!sheet?.scrollLocked}
      onScroll={mergeSheetScrollProps(sheet, mergeDockOnScroll(dock))}
      {...(Platform.OS === "web" ? ({ "data-sheet-scroll": "true" } as object) : null)}
    >
      {children}
    </ScrollView>
  );

  if (Platform.OS === "web" || !sheet?.nativeGesture) {
    return scroll;
  }

  return <GestureDetector gesture={sheet.nativeGesture}>{scroll}</GestureDetector>;
}

export const sheetScrollStyles = StyleSheet.create({
  fill: { flex: 1 },
});
