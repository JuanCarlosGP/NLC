import { Pressable, StyleSheet, Text, View } from "react-native";
import { Cover } from "@/components/ui/cover";
import { triggerLongPressUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

export function LibraryTile({
  id,
  title,
  subtitle,
  uri,
  round = false,
  onPress,
  onLongPress,
}: {
  id: string;
  title: string;
  subtitle: string;
  uri?: string | null;
  round?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={
        onLongPress
          ? () => {
              triggerLongPressUiHaptic();
              onLongPress();
            }
          : undefined
      }
      delayLongPress={350}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.82 : 1 }]}
    >
      <Cover id={id} label={title} uri={uri} size="fill" radius={round ? 999 : 4} />
      <View style={styles.meta}>
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.sub}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { gap: 8, width: "100%" },
  meta: { gap: 2, minHeight: 38 },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
  },
});
