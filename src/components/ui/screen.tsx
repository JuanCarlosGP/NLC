import { type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mergeDockOnScroll, useDock } from "@/lib/dock-context";
import { usePlayer } from "@/lib/player/player-context";
import { usePlayerUi } from "@/lib/player/player-ui-context";
import { colors, layout } from "@/lib/theme";

export function Screen({
  children,
  scroll = true,
  flush = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  flush?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { current } = usePlayer();
  const { miniPlayerDismissed } = usePlayerUi();
  const dock = useDock();
  const mini =
    current && !miniPlayerDismissed
      ? layout.miniPlayerHeight + layout.miniPlayerGap
      : 0;
  const reserved = dock?.reservedBottom ?? insets.bottom + layout.dockHeight + layout.dockMargin;
  const bottom = reserved + mini + 16;

  if (!scroll) {
    return (
      <View
        style={[
          styles.fill,
          {
            paddingTop: flush ? 0 : insets.top + 8,
            paddingBottom: bottom,
            paddingHorizontal: flush ? 0 : layout.screenPad,
          },
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: bottom },
      ]}
      scrollEventThrottle={16}
      onScroll={mergeDockOnScroll(dock)}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.void,
  },
  content: {
    paddingHorizontal: layout.screenPad,
    gap: 18,
  },
});
