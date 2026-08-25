import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { TxRow, txListStyle } from "@/components/wealth/tx-row";
import { colors, fonts, type } from "@/lib/theme";
import { formatEuro } from "@/lib/wealth/money";
import { ACCOUNT_KIND_LABEL, type WealthAccount } from "@/lib/wealth/types";
import { useWealth } from "@/lib/wealth/wealth-context";

export function AccountActivitySheet({
  account,
  onOpenChange,
}: {
  account: WealthAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomSheet
      open={account != null}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar movimientos de la cuenta"
      viewportRatio={0.68}
      expandable
    >
      {account ? <AccountActivityBody account={account} /> : null}
    </BottomSheet>
  );
}

function AccountActivityBody({ account }: { account: WealthAccount }) {
  const { txs, balanceOf } = useWealth();
  const items = useMemo(
    () => txs.filter((tx) => tx.accountId === account.id || tx.counterAccountId === account.id),
    [account.id, txs],
  );

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={type.sectionTitle}>{account.name}</Text>
        <Text style={styles.balance}>{formatEuro(balanceOf(account.id))}</Text>
        <Text style={type.meta}>{ACCOUNT_KIND_LABEL[account.kind]}</Text>
      </View>
      {items.length ? (
        <View style={txListStyle}>
          {items.map((tx) => (
            <TxRow key={tx.id} tx={tx} accountId={account.id} />
          ))}
        </View>
      ) : (
        <Text style={type.body}>Aún no hay movimientos en esta cuenta.</Text>
      )}
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 36,
    gap: 12,
  },
  head: { gap: 4, paddingBottom: 4 },
  balance: {
    fontFamily: fonts.sansBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
    color: colors.ink,
  },
});
