import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useI18n } from "@/lib/i18n/context";
import { AssetRow, assetListStyle } from "@/components/wealth/asset-row";
import { CashComposerSheet } from "@/components/wealth/account-composer-sheet";
import { TxComposerSheet } from "@/components/wealth/tx-composer-sheet";
import { TxRow, txListStyle } from "@/components/wealth/tx-row";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { assetPosition } from "@/lib/wealth/compute";
import { formatEuro } from "@/lib/wealth/money";
import { accountDisplayName, type WealthAccount, type WealthAsset, type WealthTxKind } from "@/lib/wealth/types";
import { useWealth } from "@/lib/wealth/wealth-context";

export function AccountActivitySheet({
  account,
  onOpenChange,
  onEditAsset,
}: {
  account: WealthAccount | null;
  onOpenChange: (open: boolean) => void;
  onEditAsset?: (asset: WealthAsset | null) => void;
}) {
  const { t } = useI18n();
  const [txOpen, setTxOpen] = useState(false);
  const [txKind, setTxKind] = useState<WealthTxKind>("income");
  const [txAccountId, setTxAccountId] = useState<string | null>(null);
  const [cashOpen, setCashOpen] = useState(false);

  function openTx(kind: WealthTxKind) {
    if (!account) return;
    triggerUiHaptic();
    setTxKind(kind);
    setTxAccountId(account.id);
    setTxOpen(true);
  }

  return (
    <>
      <BottomSheet
        open={account != null}
        onOpenChange={(open) => {
          if (!open) {
            setTxOpen(false);
            setCashOpen(false);
          }
          onOpenChange(open);
        }}
        accessibilityCloseLabel={t("wealth.closeAccountActivity")}
        viewportRatio={0.68}
        expandable
      >
        {account ? (
          <AccountActivityBody
            account={account}
            onEditAsset={onEditAsset}
            onAddTx={openTx}
            onEditCash={() => {
              triggerUiHaptic();
              setCashOpen(true);
            }}
          />
        ) : null}
      </BottomSheet>
      <TxComposerSheet
        open={txOpen}
        onOpenChange={setTxOpen}
        defaultKind={txKind}
        defaultAccountId={txKind === "transfer" ? undefined : txAccountId ?? undefined}
        defaultCounterId={txKind === "transfer" ? txAccountId ?? undefined : undefined}
      />
      <CashComposerSheet
        account={cashOpen ? account : null}
        onOpenChange={(open) => setCashOpen(open)}
      />
    </>
  );
}

function AccountActivityBody({
  account,
  onEditAsset,
  onAddTx,
  onEditCash,
}: {
  account: WealthAccount;
  onEditAsset?: (asset: WealthAsset | null) => void;
  onAddTx: (kind: WealthTxKind) => void;
  onEditCash: () => void;
}) {
  const { t } = useI18n();
  const { assets, txs, balanceOf, holdingsOf, totalOf } = useWealth();
  const cash = balanceOf(account.id);
  const invested = holdingsOf(account.id);
  const total = totalOf(account.id);
  const holdings = useMemo(
    () =>
      assets
        .filter((asset) => !asset.archived && asset.accountId === account.id)
        .map(assetPosition),
    [account.id, assets],
  );
  const items = useMemo(
    () => txs.filter((tx) => tx.accountId === account.id || tx.counterAccountId === account.id),
    [account.id, txs],
  );

  return (
    <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={type.sectionTitle}>{accountDisplayName(account)}</Text>
        <Text style={styles.balance}>{formatEuro(total)}</Text>
        <View style={styles.split}>
          <View style={styles.stat}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("wealth.cashAmount")}, ${formatEuro(cash)}`}
              onPress={onEditCash}
              style={({ pressed }) => [{ opacity: pressed ? 0.72 : 1 }]}
            >
              <Text style={styles.statValue}>{formatEuro(cash)}</Text>
              <Text style={type.label}>{t("wealth.cashAmount")}</Text>
            </Pressable>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatEuro(invested)}</Text>
            <Text style={type.label}>{t("wealth.invested")}</Text>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <Action
          label={t("wealth.income")}
          icon={<ArrowDown size={18} color={colors.void} strokeWidth={2} />}
          onPress={() => onAddTx("income")}
        />
        <Action
          label={t("wealth.transfer")}
          icon={<ArrowUpDown size={18} color={colors.void} strokeWidth={2} />}
          onPress={() => onAddTx("transfer")}
        />
      </View>
      <View style={styles.actions}>
        <Action
          label={t("wealth.expense")}
          icon={<ArrowUp size={18} color={colors.void} strokeWidth={2} />}
          onPress={() => onAddTx("expense")}
        />
        {onEditAsset ? (
          <Action
            label={t("wealth.investment")}
            icon={<Plus size={18} color={colors.void} strokeWidth={2} />}
            onPress={() => {
              triggerUiHaptic();
              onEditAsset(null);
            }}
          />
        ) : (
          <View style={styles.actionSpacer} />
        )}
      </View>
      {holdings.length ? (
        <View style={assetListStyle}>
          {holdings.map((position) => (
            <AssetRow
              key={position.asset.id}
              position={position}
              showAccount={false}
              onPress={() => {
                triggerUiHaptic();
                onEditAsset?.(position.asset);
              }}
            />
          ))}
        </View>
      ) : null}
      {items.length ? (
        <View style={txListStyle}>
          {items.map((tx) => (
            <TxRow key={tx.id} tx={tx} accountId={account.id} />
          ))}
        </View>
      ) : null}
    </SheetScrollView>
  );
}

function Action({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.86 : 1 }]}
    >
      {icon}
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
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
  split: {
    flexDirection: "row",
    gap: 24,
    paddingTop: 10,
  },
  stat: { gap: 2, minWidth: 96 },
  statValue: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: 14,
    paddingVertical: 14,
  },
  actionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.void,
  },
  actionSpacer: { flex: 1 },
});
