import { Pressable, StyleSheet, Text, View } from "react-native";
import { Cover } from "@/components/ui/cover";
import { useCoverUrl } from "@/hooks/use-cover-url";
import type { Artist } from "@/lib/nas/types";
import { useI18n } from "@/lib/i18n/context";
import { colors, fonts } from "@/lib/theme";

export function ArtistRow({
  artist,
  subtitle,
  onPress,
}: {
  artist: Artist;
  subtitle?: string;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const cover = useCoverUrl(artist.coverId);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}>
      <Cover id={artist.id} label={artist.name} uri={cover} size={56} radius={28} />
      <View style={styles.meta}>
        <Text style={styles.name}>{artist.name}</Text>
        <Text style={styles.sub}>
          {subtitle ??
            (artist.albumCount
              ? t(artist.albumCount === 1 ? "library.albumOne" : "library.albumMany", {
                  count: artist.albumCount,
                })
              : t("library.artist"))}
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
