import { useThemeId } from "@/lib/appearance/use-theme-id";
import { createStyles } from "@/lib/appearance/density";
import { Image, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/themed-text";
import { colors, coverTint, fonts } from "@/lib/theme";

export function Cover({
  id,
  label,
  uri,
  size,
  radius = 4,
}: {
  id: string;
  label: string;
  uri?: string | null;
  size: number | "fill";
  radius?: number;
}) {
  useThemeId();
  const initial = (label.trim()[0] ?? "·").toUpperCase();
  const fill = size === "fill";
  return (
    <View
      style={[
        styles.box,
        {
          width: fill ? "100%" : size,
          height: fill ? undefined : size,
          aspectRatio: fill ? 1 : undefined,
          borderRadius: radius,
          backgroundColor: coverTint(id),
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { borderRadius: radius }]} />
      ) : (
        <Text style={[styles.initial, { fontSize: fill ? 28 : Math.round((size as number) * 0.38) }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = createStyles(() => ({
  box: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  initial: {
    color: colors.accent,
    fontFamily: fonts.serif,
  },
}));
