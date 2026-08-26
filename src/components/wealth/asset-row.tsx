import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";
import { formatEuro, formatPct } from "@/lib/wealth/money";
import type { AssetPosition } from "@/lib/wealth/compute";
import { useWealth } from "@/lib/wealth/wealth-context";

export function AssetRow({
  position,
  onPress,
  showAccount = true,
}: {
  position: AssetPosition;
  onPress: () => void;
  showAccount?: boolean;
}) {
  const { liveAccounts } = useWealth();
  const up = position.pnl >= 0;
  const accountName =
    showAccount && position.asset.accountId
      ? liveAccounts.find((item) => item.id === position.asset.accountId)?.name
      : null;
  const sub = [position.asset.ticker || "Inversión", accountName].filter(Boolean).join(" · ");
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.72 : 1 }]}>
      <View style={styles.mark}>
        <Text style={styles.markText}>{(position.asset.ticker || position.asset.name).slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.meta}>
        <Text numberOfLines={1} style={styles.name}>
          {position.asset.name}
        </Text>
        <Text numberOfLines={1} style={styles.sub}>
          {sub}
        </Text>
      </View>
      <View style={styles.nums}>
        <Text style={styles.value}>{formatEuro(position.value)}</Text>
        <Text style={[styles.chg, up ? styles.up : styles.down]}>{formatPct(position.pnlPct)}</Text>
      </View>
    </Pressable>
  );
}

export const assetListStyle = {
  gap: 2,
} as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sheetRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    color: colors.ink,
  },
  meta: { flex: 1, gap: 2 },
  name: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  nums: { alignItems: "flex-end", gap: 2 },
  value: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  chg: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  up: { color: colors.ok },
  down: { color: colors.danger },
});
