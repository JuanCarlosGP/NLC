import { Pressable, StyleSheet, Text, View } from "react-native";
import { Heart } from "lucide-react-native";
import { Cover } from "@/components/ui/cover";
import { useCoverUrl } from "@/hooks/use-cover-url";
import { colors, fonts } from "@/lib/theme";

export function ShortcutCard({
  id,
  title,
  coverId,
  uri,
  liked,
  onPress,
}: {
  id: string;
  title: string;
  coverId?: string | null;
  uri?: string | null;
  liked?: boolean;
  onPress: () => void;
}) {
  const nasCover = useCoverUrl(uri || liked ? null : coverId);
  const cover = uri ?? nasCover;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.86 : 1 }]}>
      {liked ? (
        <View style={styles.liked}>
          <Heart color={colors.accent} fill={colors.accent} size={22} />
        </View>
      ) : (
        <Cover id={id} label={title} uri={cover} size={56} radius={0} />
      )}
      <Text numberOfLines={2} style={styles.title}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
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
  liked: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3A2E2E",
  },
  title: {
    flex: 1,
    paddingHorizontal: 10,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    lineHeight: 17,
    color: colors.ink,
  },
});
