import { StyleSheet, View } from "react-native";
import { Bone } from "@/components/ui/skeleton";
import { colors } from "@/lib/theme";

export function HomeShortcutBone() {
  return (
    <View style={styles.shortcut}>
      <Bone style={styles.shortcutCover} />
      <View style={styles.shortcutMeta}>
        <Bone style={styles.shortcutTitle} />
        <Bone style={styles.shortcutTitleShort} />
      </View>
    </View>
  );
}

export function HomeListSkeleton({ grid }: { grid: boolean }) {
  return (
    <View style={styles.block}>
      <View style={styles.sortBar}>
        <Bone style={styles.sortLabel} />
        <Bone style={styles.sortIcon} />
      </View>
      {grid ? (
        <View style={styles.collection}>
          {Array.from({ length: 9 }, (_, index) => (
            <View key={`tile-${index}`} style={styles.cell}>
              <Bone style={styles.tileCover} />
              <Bone style={styles.tileTitle} />
              <Bone style={styles.tileSub} />
            </View>
          ))}
        </View>
      ) : (
        <View>
          {Array.from({ length: 8 }, (_, index) => (
            <View key={`row-${index}`} style={styles.row}>
              <Bone style={styles.rowNum} />
              <View style={styles.rowMeta}>
                <Bone style={styles.rowTitle} />
                <Bone style={styles.rowSub} />
              </View>
              <Bone style={styles.rowTime} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 18 },
  shortcut: {
    flexGrow: 1,
    flexBasis: "47%",
    maxWidth: "49%",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: colors.sheetRaised,
    borderRadius: 6,
  },
  shortcutCover: {
    width: 56,
    height: 56,
    borderRadius: 0,
    backgroundColor: colors.sheetHover,
  },
  shortcutMeta: { flex: 1, paddingHorizontal: 10, gap: 6 },
  shortcutTitle: { height: 10, width: "78%" },
  shortcutTitleShort: { height: 8, width: "46%" },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  sortLabel: { height: 12, width: 92 },
  sortIcon: { width: 18, height: 18, borderRadius: 4 },
  collection: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  cell: {
    width: "33.333%",
    paddingHorizontal: 6,
    paddingBottom: 18,
    gap: 8,
  },
  tileCover: { width: "100%", aspectRatio: 1, borderRadius: 4 },
  tileTitle: { height: 10, width: "82%" },
  tileSub: { height: 8, width: "54%" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  rowNum: { width: 16, height: 10, marginHorizontal: 4 },
  rowMeta: { flex: 1, gap: 6 },
  rowTitle: { height: 12, width: "62%" },
  rowSub: { height: 9, width: "38%" },
  rowTime: { width: 28, height: 9 },
});
