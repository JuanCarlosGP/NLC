import { Pressable, StyleSheet, Text } from "react-native";
import { Check } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { t } from "@/lib/i18n/runtime";
import { colors, fonts, type } from "@/lib/theme";

export type LibrarySort = "recents" | "added" | "alpha" | "creator";

export const LIBRARY_SORTS: { id: LibrarySort; label: string }[] = [
  { id: "recents", get label() { return t("settings.sortRecents"); } },
  { id: "added", get label() { return t("settings.sortAdded"); } },
  { id: "alpha", get label() { return t("settings.sortAlpha"); } },
  { id: "creator", get label() { return t("settings.sortCreator"); } },
];

export function librarySortLabel(sort: LibrarySort): string {
  return LIBRARY_SORTS.find((item) => item.id === sort)?.label ?? t("settings.sortRecents");
}

export function LibrarySortSheet({
  open,
  value,
  onOpenChange,
  onChange,
}: {
  open: boolean;
  value: LibrarySort;
  onOpenChange: (open: boolean) => void;
  onChange: (sort: LibrarySort) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("settings.closeSort")}
      viewportRatio={0.48}
    >
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t("settings.sortBy")}</Text>
        {LIBRARY_SORTS.map((item) => {
          const active = item.id === value;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                onChange(item.id);
                onOpenChange(false);
              }}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={[styles.option, active && styles.optionActive]}>{item.label}</Text>
              {active ? <Check size={22} color={colors.accent} strokeWidth={2.4} /> : null}
            </Pressable>
          );
        })}
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 32,
    gap: 4,
  },
  heading: {
    ...type.pageTitle,
    fontSize: 28,
    lineHeight: 34,
    marginBottom: 12,
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  option: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    flex: 1,
  },
  optionActive: {
    fontFamily: fonts.sansMedium,
  },
});
