import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronRight, Plus } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { useI18n } from "@/lib/i18n/context";
import { AccountActivitySheet } from "@/components/wealth/account-activity-sheet";
import { AccountComposerSheet, AssetComposerSheet, CashComposerSheet } from "@/components/wealth/account-composer-sheet";
import { AssetRow, assetListStyle } from "@/components/wealth/asset-row";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { assetPosition } from "@/lib/wealth/compute";
import { formatEuro } from "@/lib/wealth/money";
import { ACCOUNT_KIND_LABEL, accountDisplayName, type WealthAccount, type WealthAsset } from "@/lib/wealth/types";
import { useLiveAccounts, useWealth } from "@/lib/wealth/wealth-context";

export function WealthCatalog() {
  const { t } = useI18n();
  const { assets, balanceOf, totalOf } = useWealth();
  const accounts = useLiveAccounts();
  const [accountOpen, setAccountOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<WealthAsset | null>(null);
  const [assetAccountId, setAssetAccountId] = useState<string | null>(null);
  const [preview, setPreview] = useState<WealthAccount | null>(null);
  const [cashAccount, setCashAccount] = useState<WealthAccount | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const holdings = useMemo(
    () => assets.filter((asset) => !asset.archived).map(assetPosition),
    [assets],
  );
  const unassigned = useMemo(
    () => holdings.filter((position) => !position.asset.accountId),
    [holdings],
  );

  function openAsset(next?: WealthAsset | null, accountId?: string | null) {
    triggerUiHaptic();
    setEditingAsset(next ?? null);
    setAssetAccountId(accountId ?? next?.accountId ?? null);
    setAssetOpen(true);
  }

  function openCash(account: WealthAccount) {
    triggerUiHaptic();
    setCashAccount(account);
  }

  function openAccount(account: WealthAccount) {
    triggerUiHaptic();
    setPreview(account);
  }

  function toggleAccount(id: string) {
    triggerUiHaptic();
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <Screen>
        <Text style={type.pageTitle}>{t("chrome.ledger")}</Text>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={type.sectionTitle}>{t("wealth.accounts")}</Text>
            <Pressable
              accessibilityLabel={t("wealth.newAccount")}
              onPress={() => {
                triggerUiHaptic();
                setAccountOpen(true);
              }}
            >
              <Plus size={20} color={colors.ink} strokeWidth={1.8} />
            </Pressable>
          </View>
          {accounts.length ? (
            accounts.map((account) => {
              const nested = holdings.filter((position) => position.asset.accountId === account.id);
              const cash = balanceOf(account.id);
              const total = totalOf(account.id);
              const showCash = Math.abs(cash) > 0.004;
              const hasBody = showCash || nested.length > 0;
              const open = expanded.has(account.id);
              return (
                <View key={account.id} style={styles.group}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: hasBody ? open : undefined }}
                    accessibilityLabel={`${accountDisplayName(account)}, ${formatEuro(total)}`}
                    accessibilityHint={
                      hasBody
                        ? open
                          ? t("wealth.expandA11y")
                          : t("wealth.collapseA11y")
                        : undefined
                    }
                    delayLongPress={350}
                    onPress={() => {
                      if (hasBody) toggleAccount(account.id);
                      else openAccount(account);
                    }}
                    onLongPress={() => openAccount(account)}
                    style={({ pressed }) => [styles.accountRow, { opacity: pressed ? 0.72 : 1 }]}
                  >
                    {hasBody ? (
                      open ? (
                        <ChevronDown size={18} color={colors.muted} strokeWidth={1.8} />
                      ) : (
                        <ChevronRight size={18} color={colors.muted} strokeWidth={1.8} />
                      )
                    ) : null}
                    <View style={styles.accountMeta}>
                      <Text style={styles.accountName}>{accountDisplayName(account)}</Text>
                      <Text style={type.meta}>{ACCOUNT_KIND_LABEL[account.kind]}</Text>
                    </View>
                    <Text style={styles.accountBal}>{formatEuro(total)}</Text>
                  </Pressable>
                  {open && hasBody ? (
                    <View style={[assetListStyle, styles.nested]}>
                      {showCash ? (
                        <CashRow amount={cash} onPress={() => openCash(account)} />
                      ) : null}
                      {nested.map((position) => (
                        <AssetRow
                          key={position.asset.id}
                          position={position}
                          showAccount={false}
                          onPress={() => openAsset(position.asset, account.id)}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text style={type.body}>{t("wealth.emptyAccounts")}</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={type.sectionTitle}>{unassigned.length ? t("wealth.noAccount") : t("wealth.assets")}</Text>
            <Pressable
              accessibilityLabel={t("wealth.newAsset")}
              onPress={() => openAsset(null)}
            >
              <Plus size={20} color={colors.ink} strokeWidth={1.8} />
            </Pressable>
          </View>
          {unassigned.length ? (
            <View style={assetListStyle}>
              {unassigned.map((position) => (
                <AssetRow
                  key={position.asset.id}
                  position={position}
                  showAccount={false}
                  onPress={() => openAsset(position.asset)}
                />
              ))}
            </View>
          ) : holdings.length ? null : (
            <Text style={type.body}>{t("wealth.emptyUnassignedHint")}</Text>
          )}
        </View>
      </Screen>
      <AccountComposerSheet open={accountOpen} onOpenChange={setAccountOpen} />
      <AssetComposerSheet
        open={assetOpen}
        asset={editingAsset}
        defaultAccountId={assetAccountId}
        onOpenChange={(open) => {
          setAssetOpen(open);
          if (!open) {
            setEditingAsset(null);
            setAssetAccountId(null);
          }
        }}
      />
      <CashComposerSheet
        account={cashAccount}
        onOpenChange={(open) => {
          if (!open) setCashAccount(null);
        }}
      />
      <AccountActivitySheet
        account={preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        onEditAsset={(asset) => {
          if (!preview) return;
          openAsset(asset, preview.id);
        }}
      />
    </>
  );
}

function CashRow({ amount, onPress }: { amount: number; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("wealth.cashEuro")}, ${formatEuro(amount)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.cashRow, { opacity: pressed ? 0.72 : 1 }]}
    >
      <View style={styles.cashMark}>
        <Text style={styles.cashMarkText}>€</Text>
      </View>
      <View style={styles.cashMeta}>
        <Text style={styles.cashName}>{t("wealth.cashA11y")}</Text>
        <Text style={styles.cashSub}>{t("wealth.available")}</Text>
      </View>
      <Text style={styles.cashValue}>{formatEuro(amount)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 4, paddingTop: 8 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 4,
  },
  group: { paddingBottom: 4 },
  nested: { paddingLeft: 12 },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  accountMeta: { flex: 1, paddingRight: 8, gap: 2 },
  accountName: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  accountBal: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  cashRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  cashMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sheetRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  cashMarkText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  cashMeta: { flex: 1, gap: 2 },
  cashName: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  cashSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  cashValue: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
});
