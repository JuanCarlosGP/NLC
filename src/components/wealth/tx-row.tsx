import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { formatEuro, formatSignedEuro } from "@/lib/wealth/money";
import { useTxActions } from "@/lib/wealth/tx-actions-context";
import { TX_KIND_LABEL, type WealthTx } from "@/lib/wealth/types";

function signedAmount(tx: WealthTx, accountId?: string): number {
  if (accountId && tx.kind === "transfer") {
    if (tx.counterAccountId === accountId) return tx.amount;
    if (tx.accountId === accountId) return -tx.amount;
    return 0;
  }
  if (tx.kind === "income" || tx.kind === "sell") return tx.amount;
  if (tx.kind === "transfer") return 0;
  return -tx.amount;
}

export function TxRow({
  tx,
  accountId,
  onPress,
}: {
  tx: WealthTx;
  accountId?: string;
  onPress?: () => void;
}) {
  const { openTxActions } = useTxActions();
  const signed = signedAmount(tx, accountId);
  const when = new Date(tx.bookedAt);
  const date = when.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Mantén pulsado para editar"
      delayLongPress={350}
      onPress={
        onPress
          ? () => {
              triggerSelectionUiHaptic();
              onPress();
            }
          : undefined
      }
      onLongPress={() => openTxActions(tx)}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.72 : 1 }]}
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
        {tx.kind === "transfer" && !accountId ? formatEuro(tx.amount) : formatSignedEuro(signed)}
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
