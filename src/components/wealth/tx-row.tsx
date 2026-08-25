import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";
import { formatEuro, formatSignedEuro } from "@/lib/wealth/money";
import { TX_KIND_LABEL, type WealthTx } from "@/lib/wealth/types";

function signedAmount(tx: WealthTx): number {
  if (tx.kind === "income" || tx.kind === "sell") return tx.amount;
  if (tx.kind === "transfer") return 0;
  return -tx.amount;
}

export function TxRow({ tx, onPress }: { tx: WealthTx; onPress?: () => void }) {
  const signed = signedAmount(tx);
  const when = new Date(tx.bookedAt);
  const date = when.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed && onPress ? 0.72 : 1 }]}
    >
      <View style={styles.meta}>
        <Text numberOfLines={1} style={styles.title}>
          {tx.title}
        </Text>
        <Text numberOfLines={1} style={styles.sub}>
          {TX_KIND_LABEL[tx.kind]}
          {tx.category ? ` · ${tx.category}` : ""} · {date}
        </Text>
      </View>
      <Text style={[styles.amount, signed > 0 ? styles.in : signed < 0 ? styles.out : styles.flat]}>
        {tx.kind === "transfer" ? formatEuro(tx.amount) : formatSignedEuro(signed)}
      </Text>
    </Pressable>
  );
}

export const txListStyle = { gap: 2 } as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  meta: { flex: 1, gap: 2 },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  amount: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
  in: { color: colors.ok },
  out: { color: colors.danger },
  flat: { color: colors.ink },
});
