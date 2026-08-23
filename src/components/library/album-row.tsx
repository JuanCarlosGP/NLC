import { Pressable, StyleSheet, Text, View } from "react-native";
import { Cover } from "@/components/ui/cover";
import { useCoverUrl } from "@/hooks/use-cover-url";
import type { Album } from "@/lib/nas/types";
import { colors, fonts } from "@/lib/theme";

export function AlbumRow({
  album,
  coverUri,
  subtitle,
  onPress,
  onLongPress,
}: {
  album: Album;
  coverUri?: string | null;
  subtitle?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const nasCover = useCoverUrl(coverUri ? null : album.coverId);
  const cover = coverUri ?? nasCover;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}
    >
      <Cover id={album.id} label={album.name} uri={cover} size={56} radius={3} />
      <View style={styles.meta}>
        <Text style={styles.name}>{album.name}</Text>
        <Text style={styles.sub}>
          {subtitle ??
            [album.artistName, album.year, album.trackCount ? `${album.trackCount} temas` : null]
              .filter(Boolean)
              .join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  meta: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});
