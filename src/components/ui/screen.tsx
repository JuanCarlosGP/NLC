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
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { current } = usePlayer();
  const { nowPlayingOpen, miniPlayerDismissed } = usePlayerUi();
  const dock = useDock();
  const mini =
    !nowPlayingOpen && current && !miniPlayerDismissed
      ? layout.miniPlayerHeight + layout.miniPlayerGap
      : 0;
  const bottom = insets.bottom + layout.dockHeight + layout.dockMargin + mini + 16;

  if (!scroll) {
    return (
      <View style={[styles.fill, { paddingTop: insets.top + 8, paddingBottom: bottom }]}>
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
