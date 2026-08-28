import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { AccountActivitySheet } from "@/components/wealth/account-activity-sheet";
import { AccountComposerSheet, AssetComposerSheet } from "@/components/wealth/account-composer-sheet";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { formatEuro } from "@/lib/wealth/money";
import { ACCOUNT_KIND_LABEL, accountDisplayName, type WealthAccount, type WealthAsset } from "@/lib/wealth/types";
import { useLiveAccounts, useWealth } from "@/lib/wealth/wealth-context";

export default function WealthAccountsScreen() {
  const { t } = useI18n();
  const { balanceOf, holdingsOf, totalOf } = useWealth();
  const accounts = useLiveAccounts();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<WealthAccount | null>(null);
  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<WealthAsset | null>(null);
  const [assetAccountId, setAssetAccountId] = useState<string | null>(null);

  function openAsset(next?: WealthAsset | null, accountId?: string | null) {
    triggerUiHaptic();
    setEditingAsset(next ?? null);
    setAssetAccountId(accountId ?? next?.accountId ?? null);
    setAssetOpen(true);
  }

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <Text style={[type.pageTitle, styles.title]}>{t("wealth.accounts")}</Text>
          <Pressable
            accessibilityLabel={t("wealth.newAccount")}
            onPress={() => {
              triggerUiHaptic();
              setOpen(true);
            }}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Plus size={24} color={colors.ink} strokeWidth={1.8} />
          </Pressable>
        </View>
        {accounts.map((account) => {
          const cash = balanceOf(account.id);
          const invested = holdingsOf(account.id);
          const total = totalOf(account.id);
          const meta =
            invested > 0.004
              ? `${t("wealth.cashAmount")} ${formatEuro(cash)} · ${t("wealth.investedIn", { amount: formatEuro(invested) })}`
              : ACCOUNT_KIND_LABEL[account.kind];
          return (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              accessibilityLabel={`${accountDisplayName(account)}, ${formatEuro(total)}`}
              onPress={() => {
                triggerUiHaptic();
                setPreview(account);
              }}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.72 : 1 }]}
            >
              <View style={styles.meta}>
                <Text style={styles.name}>{accountDisplayName(account)}</Text>
                <Text style={type.meta}>{meta}</Text>
              </View>
              <Text style={styles.value}>{formatEuro(total)}</Text>
            </Pressable>
          );
        })}
      </Screen>
      <AccountComposerSheet open={open} onOpenChange={setOpen} />
      <AssetComposerSheet
        open={assetOpen}
        asset={editingAsset}
        defaultAccountId={assetAccountId}
        onOpenChange={(next) => {
          setAssetOpen(next);
          if (!next) {
            setEditingAsset(null);
            setAssetAccountId(null);
          }
        }}
      />
      <AccountActivitySheet
        account={preview}
        onOpenChange={(next) => {
          if (!next) setPreview(null);
        }}
        onEditAsset={(asset) => {
          if (!preview) return;
          openAsset(asset, preview.id);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  title: { flex: 1 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  name: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  meta: { flex: 1, paddingRight: 12, gap: 2 },
  value: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
});
