import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles, insetSpace, pageFrame, space } from "@/lib/appearance/density";
import { type ReactElement, type ReactNode, type Ref } from "react";
import { type RefreshControlProps, type ScrollViewProps, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mergeDockOnScroll, useDock } from "@/lib/dock-context";
import { usePlayer } from "@/lib/player/player-context";
import { usePlayerUi } from "@/lib/player/player-ui-context";
import { colors, layout } from "@/lib/theme";

export function Screen({
  children,
  scroll = true,
  flush = false,
  refreshControl,
  keyboardShouldPersistTaps,
  scrollRef,
}: {
  children: ReactNode;
  scroll?: boolean;
  flush?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
  scrollRef?: Ref<ScrollView>;
}) {
  useThemeId();
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
          pageFrame,
          {
            paddingTop: flush ? 0 : insetSpace(insets.top, 8),
            paddingBottom: flush ? 0 : bottom,
            paddingHorizontal: flush ? 0 : space(layout.screenPad),
          },
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.fill}
      contentContainerStyle={[
        styles.content,
        pageFrame,
        {
          paddingTop: flush ? 0 : insetSpace(insets.top, 12),
          paddingBottom: bottom,
          paddingHorizontal: flush ? 0 : space(layout.screenPad),
        },
      ]}
      scrollEventThrottle={16}
      onScroll={mergeDockOnScroll(dock)}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

const styles = createStyles(() => ({
  fill: {
    flex: 1,
    backgroundColor: colors.void,
  },
  content: {
    paddingHorizontal: layout.screenPad,
    gap: 18,
  },
}));
